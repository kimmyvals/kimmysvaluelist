import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TablesInsert } from "@/integrations/supabase/types";

type SkinUpsert = TablesInsert<"skins">;

// Throttle: skip if last sync was within this window.
const THROTTLE_MS = 5 * 60 * 1000;

const SHEET_ID = "1CFBiPHjCaTlHRsJVecHhEb1_rSW6-VaAtsbV2zQP43g";
// Try several candidate names per tab so renames don't break sync silently.
const MAIN_TAB_CANDIDATES = ["Main List", "Main", "main list", "Main list"];
const EXOTIC_TAB_CANDIDATES = ["Exotics", "exotics", "Exotic"];

function csvUrl(name: string) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[, $]/g, "").trim();
  if (!s || s === "-" || /^n\/?a$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(v: string | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

async function fetchTab(candidates: string[]): Promise<string[][]> {
  let lastErr: unknown = null;
  for (const name of candidates) {
    try {
      const res = await fetch(csvUrl(name), { headers: { "cache-control": "no-cache" } });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} for "${name}"`); continue; }
      const text = await res.text();
      // gviz returns HTML if sheet doesn't exist or isn't public
      if (text.trimStart().startsWith("<")) { lastErr = new Error(`Sheet not public or tab "${name}" not found`); continue; }
      return parseCSV(text);
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("Failed to fetch any tab candidate");
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    if (rows[i].some((c) => /^rarity$/i.test((c ?? "").trim()))) return i;
  }
  return 0;
}

function normKey(s: string) {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function makeGetter(headers: string[]) {
  const map = new Map<string, number>();
  headers.forEach((h, i) => map.set(normKey(h), i));
  return (row: string[], ...keys: string[]) => {
    for (const k of keys) {
      const idx = map.get(normKey(k));
      if (idx != null && row[idx] != null && String(row[idx]).trim() !== "") return row[idx];
    }
    return "";
  };
}

type Section = "main" | "exotics";

function buildRecords(rows: string[][], section: Section) {
  const hi = findHeaderRow(rows);
  if (hi >= rows.length) return [];
  const get = makeGetter(rows[hi]);
  const records: SkinUpsert[] = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => !c || !String(c).trim())) continue;
    const name = str(get(row, "Skin", "Name"));
    const weapon = str(get(row, "Weapon"));
    if (!name || !weapon) continue;
    const caseField = str(get(row, "Case")) ?? "Misc";
    const isInfect = caseField === "Infect '24";
    const ktsv = num(get(row, "KT/SV Value", "KT Value", "SV Value"));
    records.push({
      name,
      weapon_type: weapon,
      season: caseField,
      rarity: str(get(row, "Rarity")) ?? "Common",
      value: num(get(row, "Value")) ?? 0,
      demand: num(get(row, "Demand")),
      kt_sv_demand: num(get(row, "KT/SV Demand", "KT Demand", "SV Demand")),
      kt_value: isInfect ? null : ktsv,
      sv_value: isInfect ? ktsv : null,
      amount_unboxed: str(get(row, "Estimated # Copies", "Copies", "Unboxed")),
      trend: str(get(row, "Trend")),
      kt_trend: str(get(row, "KT Trend", "KT/SV Trend")),
      section,
    });
  }
  return records;
}

export type SyncResult = {
  main: number;
  exotics: number;
  errors: string[];
  at: string;
  skipped?: boolean;
};

// Public read of last sync time — safe for anon visitors, no writes.
export const getSyncStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("sync_state")
    .select("last_synced_at, main_count, exotics_count, last_error")
    .eq("id", "sheet")
    .maybeSingle();
  return {
    lastSyncedAt: data?.last_synced_at ?? null,
    mainCount: data?.main_count ?? 0,
    exoticsCount: data?.exotics_count ?? 0,
    lastError: data?.last_error ?? null,
  };
});

// Editor-only sync. Throttled to avoid hammering the DB.
export const syncFromGoogleSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncResult> => {
    const { supabase, userId } = context;

    // Gate: editor or admin only.
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("editor") && !roleSet.has("admin")) {
      throw new Error("Forbidden");
    }

    const out: SyncResult = { main: 0, exotics: 0, errors: [], at: new Date().toISOString() };

    // Throttle by reading last sync time.
    const { data: state } = await supabaseAdmin
      .from("sync_state")
      .select("last_synced_at")
      .eq("id", "sheet")
      .maybeSingle();
    if (state?.last_synced_at) {
      const age = Date.now() - new Date(state.last_synced_at).getTime();
      if (age < THROTTLE_MS) {
        return { ...out, at: state.last_synced_at, skipped: true };
      }
    }

    const tasks: Array<[string, Section, string[]]> = [
      ["main", "main", MAIN_TAB_CANDIDATES],
      ["exotics", "exotics", EXOTIC_TAB_CANDIDATES],
    ];

    for (const [label, section, candidates] of tasks) {
      try {
        const rows = await fetchTab(candidates);
        const records = buildRecords(rows, section);
        if (!records.length) {
          out.errors.push(`${label}: no rows parsed`);
          continue;
        }
        const { error } = await supabaseAdmin
          .from("skins")
          .upsert(records, { onConflict: "weapon_type,name" });
        if (error) {
          console.error(`[sync] ${label} upsert error:`, error.message);
          out.errors.push(`${label}: sync failed`);
          continue;
        }
        if (section === "main") out.main = records.length;
        else out.exotics = records.length;
      } catch (e) {
        console.error(`[sync] ${label} error:`, e);
        out.errors.push(`${label}: sync failed`);
      }
    }

    // Persist sync state so all visitors can see when it last ran.
    await supabaseAdmin.from("sync_state").upsert({
      id: "sheet",
      last_synced_at: out.at,
      main_count: out.main,
      exotics_count: out.exotics,
      last_error: out.errors.length ? out.errors.join("; ").slice(0, 500) : null,
    });

    return out;
  });


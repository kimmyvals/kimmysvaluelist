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

function makeGetter(headers: string[]) {
  const map = new Map<string, number>();
  headers.forEach((h, i) => map.set((h ?? "").trim().toLowerCase(), i));
  return (row: string[], ...keys: string[]) => {
    for (const k of keys) {
      const idx = map.get(k.toLowerCase());
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
};

export const syncFromGoogleSheet = createServerFn({ method: "POST" }).handler(async (): Promise<SyncResult> => {
  const out: SyncResult = { main: 0, exotics: 0, errors: [], at: new Date().toISOString() };

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
      // upsert by (weapon_type, name) unique index — only the listed columns
      // are touched, so image_url / nickname / notes are preserved.
      const { error } = await supabaseAdmin
        .from("skins")
        .upsert(records, { onConflict: "weapon_type,name" });
      if (error) { out.errors.push(`${label}: ${error.message}`); continue; }
      if (section === "main") out.main = records.length;
      else out.exotics = records.length;
    } catch (e) {
      out.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
});

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Today's challenge is keyed by UTC date so every player sees the same
 * puzzle worldwide and the leaderboard makes sense.
 */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Deterministic mulberry32 seeded from the day so a given date always
 * yields the same challenge for everyone.
 */
export function dailyRng(dateKey: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const submitDailyScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { score: number }) => {
    const s = Math.floor(Number(d.score));
    if (!Number.isFinite(s) || s < 0 || s > 1_000_000) throw new Error("Invalid score");
    return { score: s };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const date = todayKey();

    // Look up username so the leaderboard is human-readable without joins.
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", userId)
      .maybeSingle();
    const username = profile?.username ?? "player";

    // Keep the best score for the day; upsert and then only update if higher.
    const { data: existing } = await supabase
      .from("daily_scores")
      .select("score")
      .eq("user_id", userId)
      .eq("game_date", date)
      .maybeSingle();

    if (existing && existing.score >= data.score) {
      return { ok: true, kept: existing.score };
    }
    if (existing) {
      const { error } = await supabase
        .from("daily_scores")
        .update({ score: data.score, username })
        .eq("user_id", userId).eq("game_date", date);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("daily_scores")
        .insert({ user_id: userId, game_date: date, score: data.score, username });
      if (error) throw new Error(error.message);
    }
    return { ok: true, kept: data.score };
  });

export const getDailyLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const date = todayKey();
  const { data, error } = await supabaseAdmin
    .from("daily_scores")
    .select("username, score")
    .eq("game_date", date)
    .order("score", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return { date, entries: data ?? [] };
});

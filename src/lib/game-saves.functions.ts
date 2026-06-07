import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GameKey = "market" | "memorize" | "cases";

// Load this user's save for a given game key.
export const loadGameSave = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: GameKey }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("game_saves")
      .select("data, updated_at")
      .eq("user_id", userId)
      .eq("game_key", data.key)
      .maybeSingle();
    return { data: (row?.data ?? null) as unknown, updatedAt: row?.updated_at ?? null };
  });

// Persist this user's save. Caller is responsible for shaping `data`.
export const saveGameSave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: GameKey; data: unknown }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Cap payload size to ~256 KB to prevent abuse.
    const serialized = JSON.stringify(data.data ?? {});
    if (serialized.length > 256 * 1024) throw new Error("Save too large");
    const { error } = await supabase
      .from("game_saves")
      .upsert({ user_id: userId, game_key: data.key, data: data.data }, { onConflict: "user_id,game_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

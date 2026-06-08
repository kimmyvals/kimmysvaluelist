import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export type GameKey = "market" | "memorize" | "cases" | "snowfall" | "daily";

export const loadGameSave = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: GameKey }) => d)
  .handler(async ({ data, context }): Promise<{ data: Json | null; updatedAt: string | null }> => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("game_saves")
      .select("data, updated_at")
      .eq("user_id", userId)
      .eq("game_key", data.key)
      .maybeSingle();
    return { data: (row?.data ?? null) as Json | null, updatedAt: row?.updated_at ?? null };
  });

export const saveGameSave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: GameKey; data: Json }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const serialized = JSON.stringify(data.data ?? {});
    if (serialized.length > 256 * 1024) throw new Error("Save too large");
    const { error } = await supabase
      .from("game_saves")
      .upsert({ user_id: userId, game_key: data.key, data: data.data }, { onConflict: "user_id,game_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


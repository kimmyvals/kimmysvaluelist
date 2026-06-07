import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { loadGameSave, saveGameSave, type GameKey } from "@/lib/game-saves.functions";
import type { Json } from "@/integrations/supabase/types";

/**
 * Sync a localStorage-backed game save to the cloud once the user is signed in.
 *
 * On first sign-in:
 *   - cloud empty AND local exists → push local to cloud (guest progress transfers)
 *   - cloud exists                 → pull cloud (cross-device continuation)
 *
 * While signed in, state changes are debounced-saved to the cloud every 10s.
 */
export function useCloudSave<T>(opts: {
  key: GameKey;
  storageKey: string;
  state: T | null;
  setState: (s: T) => void;
}) {
  const { key, storageKey, state, setState } = opts;
  const { user } = useAuth();
  const load = useServerFn(loadGameSave);
  const save = useServerFn(saveGameSave);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!user || hydratedRef.current) return;
    hydratedRef.current = true;
    (async () => {
      try {
        const res = await load({ data: { key } });
        const cloud = res?.data;
        if (cloud && typeof cloud === "object") {
          setState(cloud as T);
          try { localStorage.setItem(storageKey, JSON.stringify(cloud)); } catch { /* ignore */ }
        } else {
          const local = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
          const payload = local ? JSON.parse(local) : state;
          if (payload) await save({ data: { key, data: payload as Json } });
        }
      } catch (e) {
        console.warn("[cloud-save] hydrate failed", e);
      }
    })();
  }, [user, key, storageKey, load, save, setState, state]);

  useEffect(() => {
    if (!user || !state) return;
    const id = setTimeout(() => {
      save({ data: { key, data: state as Json } }).catch((e) => console.warn("[cloud-save] save failed", e));
    }, 10_000);
    return () => clearTimeout(id);
  }, [state, user, key, save]);
}

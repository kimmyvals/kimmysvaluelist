import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { loadGameSave, saveGameSave, type GameKey } from "@/lib/game-saves.functions";

/**
 * Sync a localStorage-backed game save to the cloud once the user is signed in.
 *
 * Behavior on first sign-in:
 *   - if cloud is empty AND local exists → push local to cloud (guest progress transfers).
 *   - if cloud exists                    → pull cloud and overwrite local (cross-device).
 *
 * `state` is reported on change and debounced-saved to the cloud (10s) when signed in.
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

  // One-time hydrate: on sign-in, reconcile local <-> cloud.
  useEffect(() => {
    if (!user || hydratedRef.current) return;
    hydratedRef.current = true;
    (async () => {
      try {
        const res = await load({ data: { key } });
        const cloud = res?.data as T | null | undefined;
        if (cloud && typeof cloud === "object") {
          setState(cloud);
          try { localStorage.setItem(storageKey, JSON.stringify(cloud)); } catch { /* ignore */ }
        } else {
          // cloud empty — push whatever we have locally (or current state)
          const local = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
          const payload = local ? JSON.parse(local) : state;
          if (payload) await save({ data: { key, data: payload } });
        }
      } catch (e) {
        console.warn("[cloud-save] hydrate failed", e);
      }
    })();
  }, [user, key, storageKey, load, save, setState, state]);

  // Debounced cloud-save while signed in.
  useEffect(() => {
    if (!user || !state) return;
    const id = setTimeout(() => {
      save({ data: { key, data: state } }).catch((e) => console.warn("[cloud-save] save failed", e));
    }, 10_000);
    return () => clearTimeout(id);
  }, [state, user, key, save]);
}

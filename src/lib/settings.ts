import { useEffect, useState } from "react";

export type Theme =
  | "winter"
  | "spring"
  | "summer"
  | "autumn"
  | "halloween"
  | "valentines"
  | "stpatricks"
  | "fourth"
  | "neon"
  | "midnight"
  | "none";

export type AppSettings = {
  showImages: boolean;
  showEffects: boolean;
  lowPerf: boolean;
  theme: Theme;
  compact: boolean;
  hideValues: boolean;
  reduceMotion: boolean;
};

const KEY = "kimmy-valuelist-settings";
const DEFAULTS: AppSettings = {
  showImages: true,
  showEffects: true,
  lowPerf: false,
  theme: "winter",
  compact: false,
  hideValues: false,
  reduceMotion: false,
};

function read(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    if (parsed.showSnow != null && parsed.showEffects == null) {
      parsed.showEffects = parsed.showSnow;
    }
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

const listeners = new Set<() => void>();

export function useSettings(): [AppSettings, (next: Partial<AppSettings>) => void] {
  const [state, setState] = useState<AppSettings>(DEFAULTS);

  useEffect(() => {
    setState(read());
    const cb = () => setState(read());
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = state.theme;
      document.documentElement.dataset.lowPerf = state.lowPerf ? "1" : "0";
      document.documentElement.dataset.reduceMotion = state.reduceMotion ? "1" : "0";
    }
  }, [state.theme, state.lowPerf, state.reduceMotion]);

  const update = (next: Partial<AppSettings>) => {
    const merged = { ...read(), ...next };
    localStorage.setItem(KEY, JSON.stringify(merged));
    listeners.forEach((l) => l());
  };

  return [state, update];
}

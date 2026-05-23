import { useEffect, useState } from "react";

export type Theme = "winter" | "spring" | "summer" | "autumn" | "halloween";

export type AppSettings = {
  showImages: boolean;
  showEffects: boolean;
  lowPerf: boolean;
  theme: Theme;
};

const KEY = "kimmy-valuelist-settings";
const DEFAULTS: AppSettings = {
  showImages: false,
  showEffects: true,
  lowPerf: false,
  theme: "winter",
};

function read(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    // backward-compat: old key was showSnow
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
    }
  }, [state.theme, state.lowPerf]);

  const update = (next: Partial<AppSettings>) => {
    const merged = { ...read(), ...next };
    localStorage.setItem(KEY, JSON.stringify(merged));
    listeners.forEach((l) => l());
  };

  return [state, update];
}

import { useEffect, useMemo, useState } from "react";
import { useSettings, type Theme } from "@/lib/settings";

const THEME_GLYPHS: Partial<Record<Theme, string[]>> = {
  winter: ["❄"],
  spring: ["🌸", "🌷", "🌿"],
  summer: ["☀️", "🌴", "🐚"],
  autumn: ["🍂", "🍁", "🌰"],
  halloween: ["🎃", "👻", "🦇"],
  valentines: ["💖", "💘", "🌹"],
  stpatricks: ["☘️", "🍀", "💚"],
  fourth: ["🎆", "⭐", "🇺🇸"],
  neon: ["✦", "✧", "◆"],
  midnight: ["✦", "·", "✧"],
};

export function Snowfall() {
  const [settings] = useSettings();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const count = settings.lowPerf ? 15 : 60;
  const glyphs = THEME_GLYPHS[settings.theme];
  const enabled = !!glyphs && settings.theme !== "none";

  const flakes = useMemo(
    () => {
      const g = glyphs ?? ["❄"];
      return Array.from({ length: count }).map((_, i) => {
        const size = Math.random() * 12 + 6;
        const left = Math.random() * 100;
        const duration = Math.random() * 10 + 8;
        const delay = -Math.random() * 20;
        const drift = `${(Math.random() - 0.5) * 200}px`;
        const opacity = Math.random() * 0.6 + 0.4;
        const glyph = g[i % g.length];
        return { i, size, left, duration, delay, drift, opacity, glyph };
      });
    },
    [count, glyphs],
  );

  if (!mounted || !enabled) return null;

  return (
    <div className="snow-layer" aria-hidden>
      {flakes.map((f) => (
        <span
          key={f.i}
          className="snowflake"
          style={{
            left: `${f.left}%`,
            fontSize: `${f.size}px`,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            opacity: f.opacity,
            ["--drift" as never]: f.drift,
          }}
        >
          {f.glyph}
        </span>
      ))}
    </div>
  );
}

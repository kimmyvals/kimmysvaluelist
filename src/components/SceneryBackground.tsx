import { useEffect, useMemo, useState } from "react";
import { useSettings, type Theme } from "@/lib/settings";

// Curated, royalty-free Unsplash photos served by their CDN.
// Multiple per theme; one is picked deterministically per ISO week so the
// background rotates roughly every 7 days without any backend.
const SCENERY: Record<Theme, string[]> = {
  winter: [
  winter: [
    "photo-1551582045-6ec9c11d8697", // snowy mountain peak
    "photo-1483921020237-2ff51e8e4b22", // snowy mountain range
    "photo-1454942901704-3c44c11b2ad1", // snow-capped alps
    "photo-1542601906990-b4d3fb778b09", // snowy summit
    "photo-1486162928267-e6274cb3106f", // alpine valley
  ],
    "photo-1441974231531-c6227db76b6e", // sunlit forest
    "photo-1490750967868-88aa4486c946", // wildflower field
    "photo-1500382017468-9049fed747ef", // green rolling hills
    "photo-1464822759023-fed622ff2c3b", // cherry blossoms
  ],
  summer: [
    "photo-1507525428034-b723cf961d3e", // tropical beach
    "photo-1501785888041-af3ef285b470", // mountain lake
    "photo-1473496169904-658ba7c44d8a", // sunny ocean
    "photo-1502082553048-f009c37129b9", // golden field
  ],
  autumn: [
    "photo-1507371341162-763b5e419408", // autumn forest path
    "photo-1476820865390-c52aeebb9891", // golden trees
    "photo-1508669232496-137b159c1cdb", // misty fall hills
    "photo-1444492417251-9c84a5fa18e0", // autumn leaves
  ],
  halloween: [
    "photo-1509557965875-b88c97052f0e", // pumpkin patch dusk
    "photo-1506252374453-ef5237291d83", // misty forest
    "photo-1477414348463-c0eb7f1359b6", // foggy graveyard mood
    "photo-1572883454114-1cf0031ede2a", // jack-o-lanterns
  ],
  valentines: [
    "photo-1518621736915-f3b1c41bfd00", // red roses
    "photo-1502635385003-ee1e6a1a742d", // pink florals
    "photo-1518895949257-7621c3c786d7", // soft pink sky
    "photo-1519681393784-d120267933ba", // starry mountain (romantic)
  ],
  stpatricks: [
    "photo-1500382017468-9049fed747ef", // green hills
    "photo-1535083783855-76ae62b2914e", // Irish coast
    "photo-1469474968028-56623f02e42e", // emerald valley
    "photo-1501785888041-af3ef285b470", // mountain & lake
  ],
  fourth: [
    "photo-1530541930197-ff16ac917b0e", // fireworks
    "photo-1467810563316-b5476525c0f9", // night skyline fireworks
    "photo-1492684223066-81342ee5ff30", // celebration crowd
    "photo-1532012197267-da84d127e765", // patriotic sunset
  ],
  neon: [
    "photo-1518709268805-4e9042af2176", // neon sign
    "photo-1492551557933-34265f7af79e", // neon arcade
    "photo-1493514789931-586cb221d7a7", // neon street
    "photo-1542204165-65bf26472b9b", // cyberpunk city
  ],
  midnight: [
    "photo-1419242902214-272b3f66ee7a", // starry night sky
    "photo-1444080748397-f442aa95c3e5", // milky way mountain
    "photo-1532978879514-6cb1f3a4663c", // moonlit lake
    "photo-1502134249126-9f3755a50d78", // aurora
  ],
  none: [],
};

function weeklyIndex(len: number): number {
  if (len <= 0) return 0;
  const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return ((week % len) + len) % len;
}

export function SceneryBackground() {
  const [settings] = useSettings();
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setMounted(true), []);

  const enabled =
    settings.sceneryBackground && settings.theme !== "none" && !settings.lowPerf;

  const url = useMemo(() => {
    const list = SCENERY[settings.theme] ?? [];
    if (!list.length) return null;
    const id = list[weeklyIndex(list.length)];
    return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2400&q=80`;
  }, [settings.theme]);

  // Preload so we don't briefly paint background-image over the existing
  // theme gradient with a half-loaded asset.
  useEffect(() => {
    if (!enabled || !url) {
      setLoaded(false);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    const img = new Image();
    img.onload = () => !cancelled && setLoaded(true);
    img.onerror = () => !cancelled && setLoaded(false);
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [enabled, url]);

  if (!mounted || !enabled || !url || !loaded) return null;

  return (
    <div className="scenery-bg" aria-hidden>
      <div
        className="scenery-bg__image"
        style={{ backgroundImage: `url(${url})` }}
      />
      <div className="scenery-bg__veil" />
    </div>
  );
}

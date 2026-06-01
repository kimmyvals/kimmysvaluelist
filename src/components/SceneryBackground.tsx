import { useEffect, useMemo, useState } from "react";
import { useSettings, type Theme } from "@/lib/settings";

// Curated Unsplash photos — verified to match their theme visually.
// Multiple per theme; one is picked deterministically per ISO week so the
// background rotates roughly every 7 days without any backend.
// Each ID is a hand-picked Unsplash photo whose subject matches the theme.
// Format: https://images.unsplash.com/photo-<id>
const SCENERY: Record<Theme, string[]> = {
  winter: [
    "photo-1418985991508-e47386d96a71", // snow-covered alpine peaks
    "photo-1483728642387-6c3bdd6c93e5", // snowy mountain panorama
    "photo-1457269449834-928af64c684d", // snowy forest mountainside
    "photo-1486901796908-b9a4d31a3eb6", // snowy peak with pine forest
  ],
  spring: [
    "photo-1464822759023-fed622ff2c3b", // cherry blossoms in bloom
    "photo-1490750967868-88aa4486c946", // wildflower meadow
    "photo-1441974231531-c6227db76b6e", // sunlit green forest
    "photo-1500382017468-9049fed747ef", // rolling green hills
  ],
  summer: [
    "photo-1507525428034-b723cf961d3e", // tropical beach with clear water
    "photo-1473496169904-658ba7c44d8a", // sunny ocean horizon
    "photo-1501785888041-af3ef285b470", // mountain lake in summer
    "photo-1502082553048-f009c37129b9", // golden sunlit field
  ],
  autumn: [
    "photo-1507371341162-763b5e419408", // autumn forest path with orange leaves
    "photo-1476820865390-c52aeebb9891", // golden autumn trees
    "photo-1508669232496-137b159c1cdb", // misty fall hillside
    "photo-1444492417251-9c84a5fa18e0", // fallen autumn leaves
  ],
  halloween: [
    "photo-1572883454114-1cf0031ede2a", // jack-o-lanterns row at night
    "photo-1508361727343-ca787442dcd7", // misty graveyard with bare trees
    "photo-1506243783593-c8a443ee9f59", // pumpkins on porch
    "photo-1635776062764-e025521e3df3", // spooky haunted forest
  ],
  valentines: [
    "photo-1518621736915-f3b1c41bfd00", // deep red roses bouquet
    "photo-1487530811176-3780de880c2d", // pink heart confetti / candy
    "photo-1518895949257-7621c3c786d7", // pastel pink sky
    "photo-1582719471384-894fbb16e074", // red roses close-up
  ],
  stpatricks: [
    "photo-1469474968028-56623f02e42e", // emerald Irish cliffs
    "photo-1500382017468-9049fed747ef", // rolling green hills
    "photo-1535083783855-76ae62b2914e", // green coastal valley
    "photo-1564914615625-4daf48d05f29", // shamrock-green moss field
  ],
  fourth: [
    "photo-1498931299472-f7a63a5a1cfa", // fireworks burst against night sky
    "photo-1530268729831-4b0b9e170218", // fireworks over water with reflection
    "photo-1467810563316-b5476525c0f9", // multicolor fireworks finale
    "photo-1561622539-300ddedce0c1", // american flag with fireworks
  ],
  neon: [
    "photo-1542359649-31e03cd4d909", // neon-soaked Tokyo street
    "photo-1493514789931-586cb221d7a7", // glowing pink/blue neon alley
    "photo-1519608487953-e999c86e7455", // cyberpunk neon skyline
    "photo-1516280440614-37939bbacd81", // vivid neon arcade signage
  ],
  midnight: [
    "photo-1419242902214-272b3f66ee7a", // dense starry night sky
    "photo-1444080748397-f442aa95c3e5", // milky way over mountain
    "photo-1532978879514-6cb1f3a4663c", // moonlit calm lake
    "photo-1502134249126-9f3755a50d78", // aurora borealis
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

  // Preload image before painting so we don't flash a half-loaded background
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
    return () => { cancelled = true; };
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

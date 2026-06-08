import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RotateCcw, Snowflake, Sparkles, Star, Lock, Sun } from "lucide-react";
import { toast } from "sonner";
import { useCloudSave } from "@/lib/use-cloud-save";
import { GameTutorial, useTutorial } from "@/components/GameTutorial";

export const Route = createFileRoute("/games/snowfall")({
  component: SnowfallGame,
  head: () => ({
    meta: [
      { title: "Snowfall — kimmy's valuelist" },
      { name: "description", content: "An idle snowflake-gathering game with shimmer events, rebirth, and a constellation skill tree." },
    ],
  }),
});

// ----- Building definitions: each produces flakes/sec, scales by 1.15x -----
type BuildingDef = {
  key: string;
  name: string;
  desc: string;
  baseCost: number;
  basePps: number; // production per second
  unlockAt: number; // total flakes-ever needed to reveal
};

const BUILDINGS: BuildingDef[] = [
  { key: "catcher",  name: "Snow Catcher",     desc: "A tiny mitten that catches flakes mid-air.",       baseCost: 15,      basePps: 0.2,   unlockAt: 0 },
  { key: "cloud",    name: "Snow Cloud",       desc: "A small cloud that gently dusts your field.",      baseCost: 100,     basePps: 1,     unlockAt: 50 },
  { key: "flurry",   name: "Flurry Engine",    desc: "Mechanical bellows whip up steady flurries.",      baseCost: 1_100,   basePps: 8,     unlockAt: 600 },
  { key: "blizzard", name: "Blizzard Tower",   desc: "Channels arctic wind into your domain.",           baseCost: 12_000,  basePps: 47,    unlockAt: 7_000 },
  { key: "glacier",  name: "Glacier Forge",    desc: "Carves snow straight from ancient ice.",           baseCost: 130_000, basePps: 260,   unlockAt: 80_000 },
  { key: "aurora",   name: "Aurora Loom",      desc: "Weaves light into perpetual snowfall.",            baseCost: 1.4e6,   basePps: 1_400, unlockAt: 900_000 },
  { key: "comet",    name: "Comet Reservoir",  desc: "Recovers ice crystals from passing comets.",       baseCost: 20e6,    basePps: 7_800, unlockAt: 12e6 },
  { key: "rift",     name: "Winter Rift",      desc: "A torn seam in the sky pours snow indefinitely.",  baseCost: 330e6,   basePps: 44_000, unlockAt: 200e6 },
];

// ----- Constellations (rebirth-spend skill tree) -----
type ConstellationDef = {
  key: string;
  name: string;
  desc: string;
  maxRank: number;
  cost: (rank: number) => number; // frost cost for next rank
  apply: (rank: number, base: BuffSet) => BuffSet;
};

type BuffSet = {
  globalMult: number;
  buildingMult: Record<string, number>;
  clickMult: number;
  shimmerFreqMult: number;
  shimmerPowerMult: number;
  startingFlakes: number;
  offlineMult: number;
};

const emptyBuffs = (): BuffSet => ({
  globalMult: 1,
  buildingMult: {},
  clickMult: 1,
  shimmerFreqMult: 1,
  shimmerPowerMult: 1,
  startingFlakes: 0,
  offlineMult: 0.5,
});

const CONSTELLATIONS: ConstellationDef[] = [
  { key: "ursa",   name: "Ursa",     desc: "+10% all flake production per rank.",
    maxRank: 20, cost: (r) => Math.ceil(1 * Math.pow(1.5, r)),
    apply: (r, b) => ({ ...b, globalMult: b.globalMult * (1 + 0.1 * r) }) },
  { key: "aquila", name: "Aquila",   desc: "+25% Snow Catcher & Snow Cloud output per rank.",
    maxRank: 10, cost: (r) => Math.ceil(2 * Math.pow(1.6, r)),
    apply: (r, b) => ({
      ...b,
      buildingMult: {
        ...b.buildingMult,
        catcher: (b.buildingMult.catcher ?? 1) * (1 + 0.25 * r),
        cloud:   (b.buildingMult.cloud ?? 1) * (1 + 0.25 * r),
      },
    }) },
  { key: "lyra",   name: "Lyra",     desc: "+1 flake per click per rank, ×2 multiplier per rank.",
    maxRank: 10, cost: (r) => Math.ceil(3 * Math.pow(1.7, r)),
    apply: (r, b) => ({ ...b, clickMult: b.clickMult * Math.pow(2, r) }) },
  { key: "polaris", name: "Polaris", desc: "Shimmer events twice as common per rank.",
    maxRank: 5,  cost: (r) => Math.ceil(5 * Math.pow(2, r)),
    apply: (r, b) => ({ ...b, shimmerFreqMult: b.shimmerFreqMult * Math.pow(0.5, r) }) },
  { key: "perseus", name: "Perseus", desc: "Shimmer buffs are +50% stronger per rank.",
    maxRank: 5,  cost: (r) => Math.ceil(6 * Math.pow(2, r)),
    apply: (r, b) => ({ ...b, shimmerPowerMult: b.shimmerPowerMult * (1 + 0.5 * r) }) },
  { key: "orion",  name: "Orion",    desc: "Start every Winter with +500 × 10^rank flakes.",
    maxRank: 6,  cost: (r) => Math.ceil(10 * Math.pow(2.2, r)),
    apply: (r, b) => ({ ...b, startingFlakes: b.startingFlakes + 500 * Math.pow(10, r) }) },
  { key: "draco",  name: "Draco",    desc: "+15% offline income per rank (base 50%).",
    maxRank: 10, cost: (r) => Math.ceil(8 * Math.pow(1.9, r)),
    apply: (r, b) => ({ ...b, offlineMult: b.offlineMult + 0.15 * r }) },
];

// ----- Save state -----
type SaveState = {
  flakes: number;
  totalFlakes: number;       // current Winter
  lifetimeFlakes: number;    // never reset (achievements)
  buildings: Record<string, number>;
  constellations: Record<string, number>;
  frost: number;             // rebirth currency
  rebirths: number;
  lastTickAt: number;
  shimmerNextAt: number;
  activeBuff: { until: number; mult: number } | null;
  clicks: number;
};

const STORAGE = "valuegame.snowfall.v1";
const OFFLINE_CAP_HOURS = 12;

function makeFreshSave(buffs: BuffSet): SaveState {
  return {
    flakes: buffs.startingFlakes,
    totalFlakes: buffs.startingFlakes,
    lifetimeFlakes: 0,
    buildings: {},
    constellations: {},
    frost: 0,
    rebirths: 0,
    lastTickAt: Date.now(),
    shimmerNextAt: Date.now() + 240_000 + Math.random() * 360_000, // 4–10 min initial
    activeBuff: null,
    clicks: 0,
  };
}

function loadSave(): SaveState | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(STORAGE) ?? "null"); } catch { return null; }
}
function saveSave(s: SaveState) { try { localStorage.setItem(STORAGE, JSON.stringify(s)); } catch { /* */ } }

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  if (n < 1) return n.toFixed(2);
  if (n < 1_000) return Math.floor(n).toLocaleString();
  const units = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  let i = -1; let v = n;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return v.toFixed(2) + units[i];
}

function buildingCost(b: BuildingDef, owned: number) {
  return Math.ceil(b.baseCost * Math.pow(1.15, owned));
}

/**
 * Frost gained on rebirth grows as a sqrt of lifetime flakes — slow at first,
 * then accelerates, exactly the kind of curve that hooks idle players.
 * Requires at least 1 million total flakes to gain anything.
 */
function pendingFrost(totalFlakes: number, currentRebirths: number): number {
  const REQ = 1_000_000;
  if (totalFlakes < REQ) return 0;
  const raw = Math.floor(Math.sqrt(totalFlakes / REQ) * (1 + currentRebirths * 0.05));
  return Math.max(1, raw);
}

function SnowfallGame() {
  const tut = useTutorial("snowfall");
  const [save, setSave] = useState<SaveState | null>(null);
  const [offlineEarned, setOfflineEarned] = useState<number | null>(null);
  const [showConst, setShowConst] = useState(false);

  // Compute buffs from current constellations
  const buffs = useMemo<BuffSet>(() => {
    let b = emptyBuffs();
    if (!save) return b;
    for (const c of CONSTELLATIONS) {
      const r = save.constellations[c.key] ?? 0;
      if (r > 0) b = c.apply(r, b);
    }
    return b;
  }, [save]);

  // Production-per-second (excluding active shimmer buff)
  const basePps = useMemo(() => {
    if (!save) return 0;
    let total = 0;
    for (const b of BUILDINGS) {
      const owned = save.buildings[b.key] ?? 0;
      const mult = b.basePps * (buffs.buildingMult[b.key] ?? 1) * buffs.globalMult;
      total += owned * mult;
    }
    return total;
  }, [save, buffs]);

  const buffMult = save?.activeBuff && save.activeBuff.until > Date.now() ? save.activeBuff.mult : 1;
  const pps = basePps * buffMult;

  // ---- Hydrate ----
  useEffect(() => {
    if (save) return;
    const existing = loadSave();
    if (existing) {
      // Offline earnings: use the buff multipliers from THE LOADED save's constellations
      let b = emptyBuffs();
      for (const c of CONSTELLATIONS) {
        const r = existing.constellations[c.key] ?? 0;
        if (r > 0) b = c.apply(r, b);
      }
      let basePpsLoaded = 0;
      for (const def of BUILDINGS) {
        const owned = existing.buildings[def.key] ?? 0;
        basePpsLoaded += owned * def.basePps * (b.buildingMult[def.key] ?? 1) * b.globalMult;
      }
      const elapsed = Math.min(OFFLINE_CAP_HOURS * 3600_000, Math.max(0, Date.now() - existing.lastTickAt));
      const earned = (basePpsLoaded * b.offlineMult * elapsed) / 1000;
      if (earned > 1) setOfflineEarned(earned);
      setSave({
        ...existing,
        flakes: existing.flakes + earned,
        totalFlakes: existing.totalFlakes + earned,
        lifetimeFlakes: existing.lifetimeFlakes + earned,
        lastTickAt: Date.now(),
      });
    } else {
      setSave(makeFreshSave(emptyBuffs()));
    }
  }, [save]);

  useEffect(() => { if (save) saveSave(save); }, [save]);
  useCloudSave({ key: "snowfall", storageKey: STORAGE, state: save, setState: setSave });

  // ---- Main RAF tick loop (smooth, vsync-paced, with timestamp accounting) ----
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(performance.now());

  useEffect(() => {
    function frame(now: number) {
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      setSave((s) => {
        if (!s) return s;
        // Compute pps inside the tick to use latest buildings/constellations.
        let buffs = emptyBuffs();
        for (const c of CONSTELLATIONS) {
          const r = s.constellations[c.key] ?? 0;
          if (r > 0) buffs = c.apply(r, buffs);
        }
        let base = 0;
        for (const def of BUILDINGS) {
          const owned = s.buildings[def.key] ?? 0;
          base += owned * def.basePps * (buffs.buildingMult[def.key] ?? 1) * buffs.globalMult;
        }
        const mult = s.activeBuff && s.activeBuff.until > Date.now() ? s.activeBuff.mult : 1;
        const gain = base * mult * dt;
        if (gain <= 0 && !s.activeBuff) {
          return { ...s, lastTickAt: Date.now() };
        }
        const activeBuff = s.activeBuff && s.activeBuff.until <= Date.now() ? null : s.activeBuff;
        return {
          ...s,
          flakes: s.flakes + gain,
          totalFlakes: s.totalFlakes + gain,
          lifetimeFlakes: s.lifetimeFlakes + gain,
          activeBuff,
          lastTickAt: Date.now(),
        };
      });
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ---- Shimmer events (the "golden cookie") ----
  const [shimmer, setShimmer] = useState<{ id: number; x: number; y: number; created: number } | null>(null);
  const shimmerIdRef = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      setSave((s) => {
        if (!s) return s;
        if (Date.now() >= s.shimmerNextAt && !shimmer) {
          shimmerIdRef.current += 1;
          setShimmer({
            id: shimmerIdRef.current,
            x: 10 + Math.random() * 80,
            y: 20 + Math.random() * 60,
            created: Date.now(),
          });
          const freq = 240_000 + Math.random() * 360_000; // 4–10 min
          return { ...s, shimmerNextAt: Date.now() + freq * buffs.shimmerFreqMult };
        }
        return s;
      });
      // Shimmer fades out after 14s if not clicked
      if (shimmer && Date.now() - shimmer.created > 14_000) setShimmer(null);
    }, 500);
    return () => clearInterval(id);
  }, [shimmer, buffs.shimmerFreqMult]);

  const catchShimmer = () => {
    setShimmer(null);
    setSave((s) => {
      if (!s) return s;
      const roll = Math.random();
      // 3 effect types — multiplier burst, instant flakes, or huge instant
      if (roll < 0.45) {
        const mult = 7 * buffs.shimmerPowerMult;
        toast.success(`Shimmer! ×${mult.toFixed(0)} production for 60s`);
        return { ...s, activeBuff: { until: Date.now() + 60_000, mult } };
      }
      if (roll < 0.85) {
        // 15 minutes of current production, instantly
        const gain = basePps * 900 * buffs.shimmerPowerMult;
        toast.success(`Shimmer! +${fmt(gain)} flakes`);
        return { ...s, flakes: s.flakes + gain, totalFlakes: s.totalFlakes + gain, lifetimeFlakes: s.lifetimeFlakes + gain };
      }
      // Rare: doubled mult, longer
      const mult = 15 * buffs.shimmerPowerMult;
      toast.success(`Brilliant shimmer! ×${mult.toFixed(0)} for 90s`);
      return { ...s, activeBuff: { until: Date.now() + 90_000, mult } };
    });
  };

  const clickFlake = useCallback(() => {
    setSave((s) => {
      if (!s) return s;
      // Clicks gain 1 + 1% of pps, scaled by buffs
      const click = (1 + basePps * 0.01) * buffs.clickMult * buffMult;
      return {
        ...s,
        flakes: s.flakes + click,
        totalFlakes: s.totalFlakes + click,
        lifetimeFlakes: s.lifetimeFlakes + click,
        clicks: s.clicks + 1,
      };
    });
  }, [basePps, buffs.clickMult, buffMult]);

  const buy = (key: string) => {
    setSave((s) => {
      if (!s) return s;
      const def = BUILDINGS.find((b) => b.key === key)!;
      const owned = s.buildings[key] ?? 0;
      const cost = buildingCost(def, owned);
      if (s.flakes < cost) { toast.error("Not enough flakes"); return s; }
      return {
        ...s,
        flakes: s.flakes - cost,
        buildings: { ...s.buildings, [key]: owned + 1 },
      };
    });
  };

  const rebirth = () => {
    if (!save) return;
    const frostGain = pendingFrost(save.totalFlakes, save.rebirths);
    if (frostGain <= 0) {
      toast.error("Need at least 1,000,000 flakes this Winter to rebirth");
      return;
    }
    if (!confirm(`Begin a new Winter and gain ${frostGain} Frost? You'll lose flakes & buildings but keep Frost + constellations.`)) return;
    setSave((s) => {
      if (!s) return s;
      // Compute starting flakes from current Orion rank
      let b = emptyBuffs();
      for (const c of CONSTELLATIONS) {
        const r = s.constellations[c.key] ?? 0;
        if (r > 0) b = c.apply(r, b);
      }
      return {
        ...s,
        flakes: b.startingFlakes,
        totalFlakes: b.startingFlakes,
        buildings: {},
        frost: s.frost + frostGain,
        rebirths: s.rebirths + 1,
        activeBuff: null,
        shimmerNextAt: Date.now() + 240_000,
        lastTickAt: Date.now(),
      };
    });
    toast.success(`+${frostGain} Frost. Spend it in Constellations.`);
    setShowConst(true);
  };

  const buyConst = (key: string) => {
    setSave((s) => {
      if (!s) return s;
      const def = CONSTELLATIONS.find((c) => c.key === key)!;
      const rank = s.constellations[key] ?? 0;
      if (rank >= def.maxRank) return s;
      const cost = def.cost(rank);
      if (s.frost < cost) { toast.error("Not enough Frost"); return s; }
      toast.success(`${def.name} → rank ${rank + 1}`);
      return {
        ...s,
        frost: s.frost - cost,
        constellations: { ...s.constellations, [key]: rank + 1 },
      };
    });
  };

  const reset = () => {
    if (!confirm("Wipe ALL Snowfall progress, including constellations? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE);
    setSave(null);
    setTimeout(() => window.location.reload(), 50);
  };

  if (!save) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading Snowfall…</div>;
  }

  const frostPending = pendingFrost(save.totalFlakes, save.rebirths);

  return (
    <div className="min-h-screen pb-16">
      <GameTutorial {...tut.props} title="Snowfall" steps={[
        { title: "Catch a flake", body: "Click the big snowflake to gather one. Each click is small — buildings do the heavy lifting." },
        { title: "Buy buildings", body: "Right panel. Catchers, Clouds, Flurries… each produces flakes per second. Buying more reveals stronger buildings." },
        { title: "Hunt shimmer events", body: <>A <b>golden shimmer</b> drifts across the screen every few minutes — click it for a huge multiplier burst.</> },
        { title: "Winter (rebirth)", body: <>Once you hit one million flakes you can <b>start a new Winter</b> to convert your run into <b>Frost</b>. You'll lose progress but Frost is permanent.</> },
        { title: "Constellations", body: "Spend Frost in the Constellations tree to permanently boost everything — production, click power, shimmer luck, starting flakes." },
      ]} />

      {/* Shimmer overlay */}
      {shimmer && (
        <button
          onClick={catchShimmer}
          aria-label="Catch shimmer"
          className="pointer-events-auto fixed z-40 -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110"
          style={{ left: `${shimmer.x}vw`, top: `${shimmer.y}vh` }}
        >
          <Sparkles className="h-14 w-14 text-amber-300 drop-shadow-[0_0_20px_rgba(252,211,77,0.9)] animate-pulse" />
        </button>
      )}

      <header className="border-b border-border/60" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm"><Link to="/games"><ArrowLeft className="mr-2 h-4 w-4" /> Games</Link></Button>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Snowfall</h1>
            </div>
            <div className="flex gap-2">
              <tut.Trigger />
              <Button variant="outline" size="sm" onClick={() => setShowConst((x) => !x)}>
                <Star className="mr-2 h-4 w-4" /> Constellations {save.frost > 0 && <Badge className="ml-2">{save.frost}</Badge>}
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Flakes" value={fmt(save.flakes)} highlight />
            <Stat label="Per second" value={fmt(pps)} sub={buffMult > 1 ? `×${buffMult.toFixed(1)} buff` : undefined} />
            <Stat label="Frost" value={fmt(save.frost)} sub={`Winter ×${save.rebirths}`} />
            <Stat label="Lifetime" value={fmt(save.lifetimeFlakes)} />
          </div>
          {offlineEarned != null && offlineEarned > 1 && (
            <div className="mt-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              <span className="font-semibold">Welcome back!</span> You gathered <span className="font-mono font-bold text-primary">{fmt(offlineEarned)}</span> flakes while away.
              <button className="ml-2 text-xs underline" onClick={() => setOfflineEarned(null)}>dismiss</button>
            </div>
          )}
        </div>
      </header>

      {showConst ? (
        <ConstellationsPanel save={save} onBuy={buyConst} onClose={() => setShowConst(false)} />
      ) : null}

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:px-8">
        {/* Click area */}
        <div className="lg:col-span-5">
          <Card className="relative overflow-hidden p-6" style={{ background: "var(--gradient-card)" }}>
            <div className="flex flex-col items-center">
              <button
                onClick={clickFlake}
                aria-label="Gather a flake"
                className="group relative my-6 flex h-56 w-56 items-center justify-center rounded-full transition-transform active:scale-95"
                style={{ filter: "drop-shadow(0 0 20px rgba(180,210,255,0.45))" }}
              >
                <div className="absolute inset-0 animate-spin rounded-full" style={{ animationDuration: "30s", background: "conic-gradient(from 0deg, rgba(255,255,255,0.04), rgba(160,210,255,0.18), rgba(255,255,255,0.04))" }} />
                <BigSnowflakeSvg />
              </button>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Click for <span className="font-mono text-foreground">{fmt((1 + basePps * 0.01) * buffs.clickMult * buffMult)}</span> flakes
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Next shimmer ≈ {Math.max(0, Math.ceil((save.shimmerNextAt - Date.now()) / 60_000))}m
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4 text-center">
              <div className="text-sm text-muted-foreground">Begin a new Winter to convert progress to Frost</div>
              <Button onClick={rebirth} disabled={frostPending <= 0} variant={frostPending > 0 ? "default" : "outline"}>
                <Sun className="mr-2 h-4 w-4" /> {frostPending > 0 ? `Winter (+${frostPending} Frost)` : `Need ${fmt(Math.max(0, 1_000_000 - save.totalFlakes))} more flakes`}
              </Button>
            </div>
          </Card>
        </div>

        {/* Buildings */}
        <div className="lg:col-span-7">
          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">Buildings</div>
            <div className="space-y-2">
              {BUILDINGS.map((b) => {
                const owned = save.buildings[b.key] ?? 0;
                const cost = buildingCost(b, owned);
                const locked = save.lifetimeFlakes < b.unlockAt && owned === 0;
                if (locked && save.lifetimeFlakes < b.unlockAt * 0.5) return null;
                const can = save.flakes >= cost && !locked;
                const out = b.basePps * (buffs.buildingMult[b.key] ?? 1) * buffs.globalMult;
                return (
                  <button key={b.key} onClick={() => !locked && buy(b.key)} disabled={!can}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      locked ? "border-border/40 bg-secondary/20 opacity-60" :
                      can ? "border-primary/40 hover:bg-primary/10" : "border-border/60 opacity-70"
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-md bg-secondary/40">
                        {locked ? <Lock className="h-5 w-5 text-muted-foreground" /> : <Snowflake className="h-5 w-5 text-sky-200" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {locked ? "???" : b.name}
                          <span className="ml-auto text-xs text-muted-foreground">×{owned}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{locked ? `Unlocks at ${fmt(b.unlockAt)} lifetime flakes` : b.desc}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold text-primary">{fmt(cost)}</div>
                        <div className="text-[10px] text-muted-foreground">+{fmt(out)}/s each</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

function ConstellationsPanel({
  save, onBuy, onClose,
}: { save: SaveState; onBuy: (k: string) => void; onClose: () => void }) {
  return (
    <div className="border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Constellations</div>
            <div className="font-display text-xl font-bold">Spend <span className="text-primary">Frost</span> for permanent boosts</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CONSTELLATIONS.map((c) => {
            const rank = save.constellations[c.key] ?? 0;
            const max = rank >= c.maxRank;
            const cost = max ? 0 : c.cost(rank);
            const can = !max && save.frost >= cost;
            return (
              <button key={c.key} onClick={() => !max && onBuy(c.key)} disabled={!can}
                className={`rounded-md border p-3 text-left transition-colors ${
                  max ? "border-amber-400/50 bg-amber-400/5" :
                  can ? "border-primary/40 hover:bg-primary/10" : "border-border/60 opacity-70"
                }`}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Star className="h-4 w-4 text-amber-300" /> {c.name}
                  <span className="ml-auto text-xs text-muted-foreground">rank {rank}/{c.maxRank}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{c.desc}</div>
                <div className="mt-1 font-mono text-xs text-primary">{max ? "MAX" : `${fmt(cost)} Frost`}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BigSnowflakeSvg() {
  // Crisp six-pointed snowflake — no emoji, scales with the container.
  return (
    <svg viewBox="0 0 200 200" className="relative h-44 w-44 transition-transform group-hover:scale-105 group-active:scale-95" aria-hidden>
      <g stroke="url(#g)" strokeWidth="6" strokeLinecap="round" fill="none">
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i * 60 * Math.PI) / 180;
          const x2 = 100 + Math.cos(angle) * 80;
          const y2 = 100 + Math.sin(angle) * 80;
          // small fork at the end
          const fx1 = 100 + Math.cos(angle) * 55;
          const fy1 = 100 + Math.sin(angle) * 55;
          const f1x = fx1 + Math.cos(angle + 0.7) * 18;
          const f1y = fy1 + Math.sin(angle + 0.7) * 18;
          const f2x = fx1 + Math.cos(angle - 0.7) * 18;
          const f2y = fy1 + Math.sin(angle - 0.7) * 18;
          return (
            <g key={i}>
              <line x1="100" y1="100" x2={x2} y2={y2} />
              <line x1={fx1} y1={fy1} x2={f1x} y2={f1y} />
              <line x1={fx1} y1={fy1} x2={f2x} y2={f2y} />
            </g>
          );
        })}
      </g>
      <circle cx="100" cy="100" r="8" fill="url(#g)" />
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#7dd3fc" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? "border-primary/40 bg-primary/10" : "border-border/60 bg-card/40"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-lg font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

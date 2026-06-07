import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, Sparkles, Trophy, Clock, RotateCcw, Coins } from "lucide-react";
import { toast } from "sonner";
import type { Skin } from "@/components/SkinCard";
import { encodeImageUrl } from "@/lib/contact";
import { useCloudSave } from "@/lib/use-cloud-save";

export const Route = createFileRoute("/games/cases")({
  component: CaseGame,
  head: () => ({
    meta: [
      { title: "Case Opening — kimmy's valuelist" },
      { name: "description", content: "Open simulated cases with real rarity odds. Three free spins regenerate every hour — build the most valuable collection." },
    ],
  }),
});

// ----- Save state -----
type Pull = { id: string; at: number; value: number };
type Save = {
  inventory: Record<string, number>; // skinId -> count
  spinsUsed: number;
  lastRegenAt: number;
  totalOpens: number;
  bestPull: Pull | null;
  collectionValue: number;
};
const STORAGE = "valuegame.cases.v1";
const SPIN_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const SPIN_CAP = 3; // free spins per hour

// Weights tuned so commons dominate, exotics are rare.
const RARITY_WEIGHTS: Record<string, number> = {
  Common: 55,
  Uncommon: 25,
  Rare: 12,
  Epic: 5,
  Legendary: 2.5,
  Exotic: 0.5,
};
const RARITY_COLORS: Record<string, string> = {
  Common: "from-slate-500 to-slate-700",
  Uncommon: "from-emerald-500 to-emerald-700",
  Rare: "from-sky-500 to-blue-700",
  Epic: "from-purple-500 to-fuchsia-700",
  Legendary: "from-amber-400 to-orange-600",
  Exotic: "from-rose-500 to-red-700",
};

function loadSave(): Save | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(STORAGE) ?? "null"); } catch { return null; }
}
function persist(s: Save) { try { localStorage.setItem(STORAGE, JSON.stringify(s)); } catch { /* ignore */ } }

function fmt(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toLocaleString();
}

function weightedPick<T>(items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, it) => s + weight(it), 0);
  let r = Math.random() * total;
  for (const it of items) { r -= weight(it); if (r <= 0) return it; }
  return items[items.length - 1];
}

function CaseGame() {
  const { data: skins = [], isLoading } = useQuery({
    queryKey: ["skins-cases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("skins").select("*").limit(2000);
      if (error) throw error;
      return (data as unknown as Skin[]).filter((s) => Number(s.value) > 0);
    },
    staleTime: 5 * 60_000,
  });

  const skinMap = useMemo(() => {
    const m = new Map<string, Skin>();
    skins.forEach((s) => m.set(s.id, s));
    return m;
  }, [skins]);

  const skinsByRarity = useMemo(() => {
    const m = new Map<string, Skin[]>();
    for (const s of skins) {
      const arr = m.get(s.rarity) ?? [];
      arr.push(s);
      m.set(s.rarity, arr);
    }
    return m;
  }, [skins]);

  const [save, setSave] = useState<Save | null>(null);
  useEffect(() => {
    if (save) return;
    setSave(
      loadSave() ?? {
        inventory: {},
        spinsUsed: 0,
        lastRegenAt: Date.now(),
        totalOpens: 0,
        bestPull: null,
        collectionValue: 0,
      },
    );
  }, [save]);

  useEffect(() => { if (save) persist(save); }, [save]);
  useCloudSave({ key: "cases", storageKey: STORAGE, state: save, setState: setSave });

  // Periodic re-render so the cooldown countdown ticks.
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(id); }, []);

  // Lazy regen: a full hour resets the spin pool.
  const spinsRemaining = useMemo(() => {
    if (!save) return 0;
    const elapsed = Date.now() - save.lastRegenAt;
    if (elapsed >= SPIN_COOLDOWN_MS) return SPIN_CAP;
    return Math.max(0, SPIN_CAP - save.spinsUsed);
  }, [save]);

  const nextSpinIn = useMemo(() => {
    if (!save || spinsRemaining > 0) return 0;
    return Math.max(0, SPIN_COOLDOWN_MS - (Date.now() - save.lastRegenAt));
  }, [save, spinsRemaining]);

  const [reel, setReel] = useState<Skin[] | null>(null);
  const [reelOffset, setReelOffset] = useState(0);
  const [winner, setWinner] = useState<Skin | null>(null);
  const [spinning, setSpinning] = useState(false);

  const openCase = () => {
    if (!save || spinning) return;
    if (spinsRemaining <= 0) { toast.error("No free cases — come back when timer hits zero."); return; }
    if (!skins.length) return;

    // Pick rarity by weight, then a uniform skin of that rarity.
    const rarities = Array.from(skinsByRarity.keys());
    const rarity = weightedPick(rarities, (r) => RARITY_WEIGHTS[r] ?? 1);
    const pool = skinsByRarity.get(rarity) ?? skins;
    const won = pool[Math.floor(Math.random() * pool.length)];

    // Build a visual reel of ~30 skins with the winner near the end.
    const reelSize = 30;
    const winIndex = 25;
    const newReel: Skin[] = Array.from({ length: reelSize }, (_, i) =>
      i === winIndex ? won : skins[Math.floor(Math.random() * skins.length)],
    );
    setReel(newReel);
    setReelOffset(0);
    setWinner(null);
    setSpinning(true);

    // Each item is 96px wide + 8px gap = 104px.
    const ITEM_W = 104;
    const targetOffset = winIndex * ITEM_W - (window.innerWidth > 640 ? 200 : 130);
    // Trigger transition next frame.
    requestAnimationFrame(() => requestAnimationFrame(() => setReelOffset(targetOffset)));

    setTimeout(() => {
      setSpinning(false);
      setWinner(won);
      // Persist into save
      setSave((s) => {
        if (!s) return s;
        const elapsed = Date.now() - s.lastRegenAt;
        const regen = elapsed >= SPIN_COOLDOWN_MS;
        const spinsUsed = regen ? 1 : s.spinsUsed + 1;
        const lastRegenAt = regen ? Date.now() : s.lastRegenAt;
        const inv = { ...s.inventory, [won.id]: (s.inventory[won.id] ?? 0) + 1 };
        const wonValue = Number(won.value) || 0;
        const best = !s.bestPull || wonValue > s.bestPull.value
          ? { id: won.id, at: Date.now(), value: wonValue }
          : s.bestPull;
        let collectionValue = 0;
        for (const k in inv) {
          const sk = skinMap.get(k); if (sk) collectionValue += inv[k] * (Number(sk.value) || 0);
        }
        return {
          ...s,
          inventory: inv,
          spinsUsed,
          lastRegenAt,
          totalOpens: s.totalOpens + 1,
          bestPull: best,
          collectionValue,
        };
      });
      const rare = ["Legendary", "Exotic", "Epic"].includes(won.rarity);
      if (rare) toast.success(`✨ ${won.rarity}: ${won.name}`);
    }, 3800);
  };

  const reset = () => {
    if (!confirm("Reset your case opening collection?")) return;
    localStorage.removeItem(STORAGE);
    setSave(null);
    setWinner(null);
    setReel(null);
    setTimeout(() => window.location.reload(), 50);
  };

  if (isLoading || !save) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading cases…</div>;
  }

  const cooldownLabel = (() => {
    if (spinsRemaining > 0) return `${spinsRemaining} free case${spinsRemaining === 1 ? "" : "s"} ready`;
    const m = Math.floor(nextSpinIn / 60_000);
    const s = Math.floor((nextSpinIn % 60_000) / 1000);
    return `Next batch in ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  })();

  // Sorted inventory for display (most valuable first)
  const invList = Object.entries(save.inventory)
    .map(([id, count]) => ({ skin: skinMap.get(id), count }))
    .filter((x) => x.skin)
    .sort((a, b) => (Number(b.skin!.value) || 0) - (Number(a.skin!.value) || 0));

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-border/60" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm">
                <Link to="/games"><ArrowLeft className="mr-2 h-4 w-4" /> Games</Link>
              </Button>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Case Opening</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<Package className="h-4 w-4 text-primary" />} label="Cases opened" value={String(save.totalOpens)} />
            <Stat icon={<Coins className="h-4 w-4 text-amber-400" />} label="Collection value" value={fmt(save.collectionValue)} />
            <Stat icon={<Trophy className="h-4 w-4 text-yellow-400" />} label="Best pull" value={save.bestPull ? fmt(save.bestPull.value) : "—"} />
            <Stat icon={<Clock className="h-4 w-4 text-sky-400" />} label="Status" value={cooldownLabel} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-3 lg:px-8">
        {/* Case opening reel */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Open a case</div>
              <Badge variant="outline">{spinsRemaining}/{SPIN_CAP} free</Badge>
            </div>

            <div className="relative overflow-hidden rounded-lg border border-border/60 bg-secondary/30 py-4">
              {/* Center indicator */}
              <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-full w-0.5 -translate-x-1/2 bg-primary/70" style={{ boxShadow: "0 0 12px var(--primary)" }} />
              <div
                className="flex gap-2 px-4"
                style={{
                  transform: `translateX(-${reelOffset}px)`,
                  transition: spinning ? "transform 3.6s cubic-bezier(0.18, 0.8, 0.2, 1)" : "none",
                }}
              >
                {(reel ?? Array.from({ length: 8 }).map(() => skins[Math.floor(Math.random() * Math.max(1, skins.length))])).map((s, i) => (
                  <CaseTile key={i} skin={s} />
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <Button onClick={openCase} disabled={spinning || spinsRemaining <= 0} size="lg" className="w-full sm:w-auto">
                <Package className="mr-2 h-5 w-5" /> {spinning ? "Opening…" : "Open case"}
              </Button>
              <div className="text-xs text-muted-foreground text-center sm:text-right">
                Odds: Common 55% · Uncommon 25% · Rare 12% · Epic 5% · Legendary 2.5% · Exotic 0.5%
              </div>
            </div>

            {winner && !spinning && (
              <div className={`mt-4 overflow-hidden rounded-lg border border-border/60 bg-gradient-to-br ${RARITY_COLORS[winner.rarity] ?? "from-slate-500 to-slate-700"} p-4`}>
                <div className="flex items-center gap-4">
                  {winner.image_url ? (
                    <img src={encodeImageUrl(winner.image_url)} alt="" className="h-20 w-20 rounded bg-black/30 object-contain p-1" />
                  ) : <div className="h-20 w-20 rounded bg-black/30" />}
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider text-white/90">{winner.rarity}</div>
                    <div className="truncate font-display text-xl font-bold text-white">{winner.name}</div>
                    <div className="text-sm text-white/80">{winner.weapon_type} · {winner.season}</div>
                    <div className="mt-1 font-mono text-lg font-bold text-white">{fmt(Number(winner.value) || 0)}</div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Collection */}
        <div>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Your collection</div>
              <Badge variant="outline">{invList.length} unique</Badge>
            </div>
            {invList.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Open your first case to start collecting.</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {invList.map(({ skin, count }) => skin && (
                  <div key={skin.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 p-2">
                    {skin.image_url ? (
                      <img src={encodeImageUrl(skin.image_url)} alt="" className="h-10 w-10 rounded bg-secondary/40 object-contain" loading="lazy" />
                    ) : <div className="h-10 w-10 rounded bg-secondary/40" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">{skin.name}</div>
                      <div className="text-[10px] text-muted-foreground">{skin.rarity} · {skin.weapon_type}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-mono font-bold text-primary">×{count}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{fmt(Number(skin.value) * count)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

function CaseTile({ skin }: { skin: Skin | undefined }) {
  if (!skin) return <div className="h-24 w-24 shrink-0 rounded bg-secondary/40" />;
  const grad = RARITY_COLORS[skin.rarity] ?? "from-slate-500 to-slate-700";
  return (
    <div className={`relative h-24 w-24 shrink-0 overflow-hidden rounded border border-border/60 bg-gradient-to-br ${grad}`}>
      {skin.image_url ? (
        <img src={encodeImageUrl(skin.image_url)} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/80 px-1 text-center">{skin.name}</div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">{icon} {label}</div>
      <div className="font-mono text-sm font-bold truncate">{value}</div>
    </div>
  );
}

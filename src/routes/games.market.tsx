import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Coins, TrendingUp, TrendingDown, Package, Zap, Hammer, RotateCcw, ShoppingCart, Inbox } from "lucide-react";
import { toast } from "sonner";
import type { Skin } from "@/components/SkinCard";
import { encodeImageUrl } from "@/lib/contact";
import { useCloudSave } from "@/lib/use-cloud-save";

export const Route = createFileRoute("/games/market")({
  component: MarketGame,
  head: () => ({
    meta: [
      { title: "Market Tycoon — kimmy's valuelist" },
      { name: "description", content: "Click, trade, and fulfill orders in a live simulated skin market." },
    ],
  }),
});

// ---------- Types ----------
type GameSkin = Skin & { _baseValue: number };
type MarketEntry = { id: string; mult: number; trend: number }; // mult = current price multiplier
type InventoryEntry = { id: string; count: number; avgCost: number };
type Order = { id: string; skinId: string; qty: number; pricePer: number; expiresAt: number };

type SaveState = {
  scrip: number;
  perClick: number;
  autoPerSec: number;
  market: Record<string, MarketEntry>;
  inventory: Record<string, InventoryEntry>;
  orders: Order[];
  totalEarned: number;
  ordersFilled: number;
  upgrades: { click: number; auto: number; orderRate: number; orderPay: number };
};

const STORAGE_KEY = "valuegame.market.v1";
const TICK_MS = 1500;
const ORDER_MAX = 6;

function loadSave(): SaveState | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"); } catch { return null; }
}
function saveSave(s: SaveState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function fmt(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toLocaleString();
}

function MarketGame() {
  const { data: skins = [], isLoading } = useQuery({
    queryKey: ["skins-game"],
    queryFn: async () => {
      const { data, error } = await supabase.from("skins").select("*").limit(2000);
      if (error) throw error;
      return (data as unknown as Skin[]).filter((s) => Number(s.value) > 0);
    },
    staleTime: 5 * 60_000,
  });

  // Map of skins, indexed by id; base value used to drive market price.
  const skinMap = useMemo(() => {
    const m = new Map<string, GameSkin>();
    skins.forEach((s) => m.set(s.id, { ...s, _baseValue: Number(s.value) || 1 }));
    return m;
  }, [skins]);

  const [state, setState] = useState<SaveState | null>(null);
  const stateRef = useRef<SaveState | null>(null);
  stateRef.current = state;

  // Hydrate save (or seed a new one) once skins arrive
  useEffect(() => {
    if (!skins.length || state) return;
    const saved = loadSave();
    if (saved) {
      // prune unknown ids
      const validIds = new Set(skins.map((s) => s.id));
      const market: Record<string, MarketEntry> = {};
      Object.entries(saved.market ?? {}).forEach(([k, v]) => { if (validIds.has(k)) market[k] = v; });
      const inv: Record<string, InventoryEntry> = {};
      Object.entries(saved.inventory ?? {}).forEach(([k, v]) => { if (validIds.has(k)) inv[k] = v; });
      const orders = (saved.orders ?? []).filter((o) => validIds.has(o.skinId));
      setState({ ...saved, market, inventory: inv, orders });
    } else {
      setState({
        scrip: 50,
        perClick: 1,
        autoPerSec: 0,
        market: {},
        inventory: {},
        orders: [],
        totalEarned: 0,
        ordersFilled: 0,
        upgrades: { click: 0, auto: 0, orderRate: 0, orderPay: 0 },
      });
    }
  }, [skins, state]);

  // Persist on change (debounced via micro-batching)
  useEffect(() => {
    if (!state) return;
    const id = setTimeout(() => saveSave(state), 200);
    return () => clearTimeout(id);
  }, [state]);

  // Cloud save (signed-in only) — guest local state transfers up automatically.
  useCloudSave({ key: "market", storageKey: STORAGE_KEY, state, setState });


  // ---------- Market simulation tick ----------
  useEffect(() => {
    if (!skins.length) return;
    const interval = setInterval(() => {
      setState((s) => {
        if (!s) return s;
        const market = { ...s.market };
        // make sure every skin has a market entry (cheap)
        for (const sk of skins) {
          if (!market[sk.id]) market[sk.id] = { id: sk.id, mult: 1, trend: 0 };
        }
        // random walk each tick — small drift, clamp 0.4..2.2
        for (const k in market) {
          const e = market[k];
          // trend persists, slowly mean-reverts
          const shock = (Math.random() - 0.5) * 0.06;
          const newTrend = e.trend * 0.85 + shock;
          let newMult = e.mult * (1 + newTrend) + (1 - e.mult) * 0.02; // pull to 1
          if (newMult < 0.4) newMult = 0.4;
          if (newMult > 2.2) newMult = 2.2;
          market[k] = { id: k, mult: newMult, trend: newTrend };
        }

        // auto income
        const scripGain = (s.autoPerSec * TICK_MS) / 1000;
        const totalEarned = s.totalEarned + scripGain;

        // Spawn / expire orders
        let orders = s.orders.filter((o) => o.expiresAt > Date.now());
        const targetOrders = Math.min(ORDER_MAX, 2 + s.upgrades.orderRate);
        if (orders.length < targetOrders && skins.length) {
          const skin = skins[Math.floor(Math.random() * skins.length)];
          const mkt = market[skin.id];
          const price = Math.max(1, (Number(skin.value) || 1) * mkt.mult);
          const premium = 1.15 + Math.random() * 0.35 + s.upgrades.orderPay * 0.07; // 1.15x..1.50x +
          const qty = 1 + Math.floor(Math.random() * 3);
          const lifeMs = 25_000 + Math.floor(Math.random() * 35_000);
          orders = [
            ...orders,
            {
              id: Math.random().toString(36).slice(2),
              skinId: skin.id,
              qty,
              pricePer: Math.round(price * premium),
              expiresAt: Date.now() + lifeMs,
            },
          ];
        }

        return {
          ...s,
          market,
          orders,
          scrip: s.scrip + scripGain,
          totalEarned,
        };
      });
    }, TICK_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skins.length]);

  // ---------- Force re-render every second so order timers tick down smoothly ----------
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(id); }, []);

  const click = useCallback(() => {
    setState((s) => s ? { ...s, scrip: s.scrip + s.perClick, totalEarned: s.totalEarned + s.perClick } : s);
  }, []);

  const portfolioValue = useMemo(() => {
    if (!state) return 0;
    let v = 0;
    for (const k in state.inventory) {
      const inv = state.inventory[k];
      const sk = skinMap.get(k); if (!sk) continue;
      const mkt = state.market[k]; const mult = mkt?.mult ?? 1;
      v += inv.count * sk._baseValue * mult;
    }
    return v;
  }, [state, skinMap]);

  // ---------- Market list (sorted) ----------
  const [marketFilter, setMarketFilter] = useState<"trending" | "cheap" | "expensive">("trending");
  const marketList = useMemo(() => {
    if (!state) return [];
    const arr = skins.map((s) => {
      const gs: GameSkin = { ...(s as Skin), _baseValue: Number(s.value) || 1 };
      return { skin: gs, mkt: state.market[s.id] ?? { id: s.id, mult: 1, trend: 0 } };
    });
    if (marketFilter === "trending") arr.sort((a, b) => Math.abs(b.mkt.trend) - Math.abs(a.mkt.trend));
    else if (marketFilter === "cheap") arr.sort((a, b) => a.skin._baseValue * a.mkt.mult - b.skin._baseValue * b.mkt.mult);
    else arr.sort((a, b) => b.skin._baseValue * b.mkt.mult - a.skin._baseValue * a.mkt.mult);
    return arr.slice(0, 30);
  }, [skins, state, marketFilter]);

  const buy = (skinId: string) => {
    setState((s) => {
      if (!s) return s;
      const sk = skinMap.get(skinId); if (!sk) return s;
      const mkt = s.market[skinId]; const price = Math.max(1, Math.round(sk._baseValue * (mkt?.mult ?? 1)));
      if (s.scrip < price) { toast.error("Not enough scrip"); return s; }
      const inv = s.inventory[skinId] ?? { id: skinId, count: 0, avgCost: 0 };
      const newCount = inv.count + 1;
      const avgCost = (inv.avgCost * inv.count + price) / newCount;
      return {
        ...s,
        scrip: s.scrip - price,
        inventory: { ...s.inventory, [skinId]: { id: skinId, count: newCount, avgCost } },
      };
    });
  };

  const sell = (skinId: string) => {
    setState((s) => {
      if (!s) return s;
      const inv = s.inventory[skinId]; if (!inv || inv.count <= 0) return s;
      const sk = skinMap.get(skinId); if (!sk) return s;
      const mkt = s.market[skinId]; const price = Math.max(1, Math.round(sk._baseValue * (mkt?.mult ?? 1)));
      const newCount = inv.count - 1;
      const newInv = { ...s.inventory };
      if (newCount <= 0) delete newInv[skinId];
      else newInv[skinId] = { ...inv, count: newCount };
      return { ...s, scrip: s.scrip + price, totalEarned: s.totalEarned + price, inventory: newInv };
    });
  };

  const fulfill = (orderId: string) => {
    setState((s) => {
      if (!s) return s;
      const order = s.orders.find((o) => o.id === orderId); if (!order) return s;
      const inv = s.inventory[order.skinId];
      if (!inv || inv.count < order.qty) { toast.error("You don't have enough of that skin"); return s; }
      const newCount = inv.count - order.qty;
      const newInv = { ...s.inventory };
      if (newCount <= 0) delete newInv[order.skinId];
      else newInv[order.skinId] = { ...inv, count: newCount };
      const payout = order.pricePer * order.qty;
      toast.success(`+${fmt(payout)} scrip — order filled`);
      return {
        ...s,
        inventory: newInv,
        orders: s.orders.filter((o) => o.id !== orderId),
        scrip: s.scrip + payout,
        totalEarned: s.totalEarned + payout,
        ordersFilled: s.ordersFilled + 1,
      };
    });
  };

  // ---------- Upgrades ----------
  const upgrades = [
    { key: "click" as const, name: "Stronger Clicks", desc: "+1 scrip per click", icon: <Zap className="h-4 w-4" />,
      cost: (lvl: number) => Math.round(25 * Math.pow(1.5, lvl)),
      apply: (s: SaveState) => ({ ...s, perClick: s.perClick + 1, upgrades: { ...s.upgrades, click: s.upgrades.click + 1 } }) },
    { key: "auto" as const, name: "Auto Trader", desc: "+1 scrip/sec passively", icon: <Hammer className="h-4 w-4" />,
      cost: (lvl: number) => Math.round(100 * Math.pow(1.6, lvl)),
      apply: (s: SaveState) => ({ ...s, autoPerSec: s.autoPerSec + 1, upgrades: { ...s.upgrades, auto: s.upgrades.auto + 1 } }) },
    { key: "orderRate" as const, name: "Bigger Inbox", desc: "+1 max simultaneous order", icon: <Inbox className="h-4 w-4" />,
      cost: (lvl: number) => Math.round(500 * Math.pow(2.0, lvl)),
      apply: (s: SaveState) => ({ ...s, upgrades: { ...s.upgrades, orderRate: s.upgrades.orderRate + 1 } }) },
    { key: "orderPay" as const, name: "Negotiator", desc: "+7% pay on all orders", icon: <Coins className="h-4 w-4" />,
      cost: (lvl: number) => Math.round(750 * Math.pow(1.8, lvl)),
      apply: (s: SaveState) => ({ ...s, upgrades: { ...s.upgrades, orderPay: s.upgrades.orderPay + 1 } }) },
  ];

  const buyUpgrade = (key: typeof upgrades[number]["key"]) => {
    setState((s) => {
      if (!s) return s;
      const u = upgrades.find((x) => x.key === key)!;
      const lvl = s.upgrades[key];
      const cost = u.cost(lvl);
      if (s.scrip < cost) { toast.error("Not enough scrip"); return s; }
      const next = u.apply({ ...s, scrip: s.scrip - cost });
      toast.success(`${u.name} → lvl ${lvl + 1}`);
      return next;
    });
  };

  const reset = () => {
    if (!confirm("Wipe progress and start over?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setState(null);
    setTimeout(() => window.location.reload(), 50);
  };

  if (isLoading || !state) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading market…</div>;
  }

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-border/60" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm"><Link to="/games"><ArrowLeft className="mr-2 h-4 w-4" /> Games</Link></Button>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Market Tycoon</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Scrip" value={fmt(state.scrip)} highlight />
            <Stat label="Portfolio value" value={fmt(portfolioValue)} />
            <Stat label="Per click" value={`+${state.perClick}`} />
            <Stat label="Per sec" value={`+${state.autoPerSec}`} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:px-8">
        {/* Left: clicker + upgrades */}
        <div className="space-y-4 lg:col-span-3">
          <Card className="p-4">
            <button
              onClick={click}
              className="group relative w-full overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-br from-primary/20 to-primary/5 px-4 py-10 transition-all hover:scale-[1.01] hover:from-primary/30 active:scale-[0.98]"
            >
              <Coins className="mx-auto h-10 w-10 text-primary" />
              <div className="mt-2 font-display text-xl font-bold">Click for scrip</div>
              <div className="text-xs text-muted-foreground">+{state.perClick} per click</div>
            </button>
          </Card>
          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">Upgrades</div>
            <div className="space-y-2">
              {upgrades.map((u) => {
                const lvl = state.upgrades[u.key];
                const cost = u.cost(lvl);
                const can = state.scrip >= cost;
                return (
                  <button
                    key={u.key}
                    onClick={() => buyUpgrade(u.key)}
                    disabled={!can}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${can ? "border-primary/40 hover:bg-primary/10" : "border-border/60 opacity-60"}`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {u.icon} {u.name} <span className="ml-auto text-xs text-muted-foreground">lvl {lvl}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{u.desc}</div>
                    <div className="mt-1 text-xs font-mono text-primary">{fmt(cost)} scrip</div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Middle: orders */}
        <div className="space-y-4 lg:col-span-5">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold"><Inbox className="h-4 w-4 text-primary" /> Incoming orders</div>
              <Badge variant="outline">{state.orders.length}/{Math.min(ORDER_MAX, 2 + state.upgrades.orderRate)}</Badge>
            </div>
            {state.orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No orders yet — they'll roll in soon.</p>
            ) : (
              <div className="space-y-2">
                {state.orders.map((o) => {
                  const sk = skinMap.get(o.skinId); if (!sk) return null;
                  const have = state.inventory[o.skinId]?.count ?? 0;
                  const can = have >= o.qty;
                  const remain = Math.max(0, o.expiresAt - Date.now());
                  const lifeFrac = Math.min(100, (remain / 60_000) * 100);
                  return (
                    <div key={o.id} className="rounded-md border border-border/60 p-3">
                      <div className="flex items-center gap-3">
                        {sk.image_url ? (
                          <img src={encodeImageUrl(sk.image_url)} alt="" className="h-12 w-12 rounded bg-secondary/40 object-contain" loading="lazy" />
                        ) : <div className="h-12 w-12 rounded bg-secondary/40" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{sk.name}</div>
                          <div className="text-xs text-muted-foreground">{sk.weapon_type} · {sk.season}</div>
                          <div className="mt-1 text-xs">
                            Need <span className="font-bold">×{o.qty}</span> · pays <span className="font-mono text-primary">{fmt(o.pricePer * o.qty)}</span>
                          </div>
                        </div>
                        <Button size="sm" disabled={!can} onClick={() => fulfill(o.id)}>
                          {can ? "Fulfill" : `Have ${have}/${o.qty}`}
                        </Button>
                      </div>
                      <Progress value={lifeFrac} className="mt-2 h-1" />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-primary" /> Inventory</div>
            {Object.keys(state.inventory).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Buy skins from the market to start stocking up.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.values(state.inventory).map((inv) => {
                  const sk = skinMap.get(inv.id); if (!sk) return null;
                  const mkt = state.market[inv.id]; const price = Math.round(sk._baseValue * (mkt?.mult ?? 1));
                  const profit = price - inv.avgCost;
                  return (
                    <div key={inv.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2">
                      {sk.image_url ? (
                        <img src={encodeImageUrl(sk.image_url)} alt="" className="h-9 w-9 rounded bg-secondary/40 object-contain" loading="lazy" />
                      ) : <div className="h-9 w-9 rounded bg-secondary/40" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold">{sk.name} ×{inv.count}</div>
                        <div className={`text-[10px] font-mono ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {profit >= 0 ? "+" : ""}{fmt(profit)}/ea
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => sell(inv.id)}>Sell</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right: market */}
        <div className="lg:col-span-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="h-4 w-4 text-primary" /> Live Market</div>
              <div className="flex gap-1 text-xs">
                {(["trending", "cheap", "expensive"] as const).map((f) => (
                  <button key={f} onClick={() => setMarketFilter(f)}
                    className={`rounded-md px-2 py-1 ${marketFilter === f ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary/50"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[600px] space-y-1 overflow-y-auto pr-1">
              {marketList.map(({ skin, mkt }) => {
                const price = Math.max(1, Math.round(skin._baseValue * mkt.mult));
                const up = mkt.trend > 0.005;
                const down = mkt.trend < -0.005;
                return (
                  <div key={skin.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
                    {skin.image_url ? (
                      <img src={encodeImageUrl(skin.image_url)} alt="" className="h-8 w-8 rounded bg-secondary/40 object-contain" loading="lazy" />
                    ) : <div className="h-8 w-8 rounded bg-secondary/40" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">{skin.name}</div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {up && <TrendingUp className="h-3 w-3 text-green-400" />}
                        {down && <TrendingDown className="h-3 w-3 text-red-400" />}
                        <span className={up ? "text-green-400" : down ? "text-red-400" : ""}>×{mkt.mult.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs">{fmt(price)}</div>
                      <Button size="sm" variant="outline" className="mt-1 h-6 px-2 text-[10px]"
                        disabled={state.scrip < price} onClick={() => buy(skin.id)}>
                        Buy
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? "border-primary/60 bg-primary/10" : "border-border/60 bg-card/40"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-bold">{value}</div>
    </div>
  );
}

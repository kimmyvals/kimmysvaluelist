import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { encodeImageUrl } from "@/lib/contact";

export type Skin = {
  id: string;
  name: string;
  nickname: string | null;
  image_url: string | null;
  weapon_type: string;
  season: string;
  value: number;
  demand: number | null;
  rarity: string;
  updated_at: string;
  kt_value: number | null;
  sv_value: number | null;
  kt_sv_demand: number | null;
  amount_unboxed: string | null;
  section?: string | null;
  trend?: string | null;
  kt_trend?: string | null;
};

function TrendBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const up = /^(up|\+|↑|▲|rising|rise)/i.test(v);
  const down = /^(down|-|↓|▼|falling|fall)/i.test(v);
  const stable = /^(stable|=|—|–|flat)/i.test(v);
  const color = up
    ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
    : down
      ? "text-rose-300 border-rose-400/40 bg-rose-400/10"
      : stable
        ? "text-zinc-300 border-zinc-400/30 bg-zinc-400/10"
        : "text-sky-200 border-sky-400/30 bg-sky-400/10";
  const arrow = up ? "▲" : down ? "▼" : stable ? "■" : "•";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      <span>{arrow}</span>
      <span className="font-mono">{v.replace(/^[↑↓▲▼+\-=]+\s*/, "")}</span>
    </span>
  );
}

const rarityClass: Record<string, string> = {
  Limited: "bg-yellow-400/20 text-yellow-200 border-yellow-400/50",
  Exotic: "bg-orange-400/20 text-orange-200 border-orange-400/50",
  Legendary: "bg-red-500/20 text-red-300 border-red-500/50",
  Epic: "bg-purple-500/20 text-purple-300 border-purple-500/50",
  Rare: "bg-sky-400/15 text-sky-200 border-sky-400/40",
  Uncommon: "bg-green-400/20 text-green-200 border-green-400/40",
  Common: "bg-zinc-400/15 text-zinc-300 border-zinc-400/40",
};

const rarityRing: Record<string, string> = {
  Limited: "border-yellow-400/60",
  Exotic: "border-orange-400/60",
  Legendary: "border-red-500/60",
  Epic: "border-purple-500/50",
  Rare: "border-sky-400/40",
  Uncommon: "border-green-400/30",
  Common: "border-zinc-400/30",
};

export function SkinCard({ skin, onClick }: { skin: Skin; onClick: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  const [settings] = useSettings();
  const { isEditor } = useAuth();
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("skins").delete().eq("id", skin.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skins"] });
      toast.success("Skin deleted");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const valueClass = settings.hideValues ? "blur-sm transition hover:blur-none" : "";

  return (
    <Card
      onClick={onClick}
      // skin-card class picks up the hover-lift CSS defined in styles.css
      className={`skin-card group relative cursor-pointer overflow-hidden border-2 ${rarityRing[skin.rarity] ?? "border-border/60"} p-0 transition-all hover:-translate-y-1 hover:border-primary/60`}
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
    >
      {isEditor && (
        <Button
          variant="destructive"
          size="icon"
          className="absolute right-2 bottom-2 z-10 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete "${skin.name}"? This cannot be undone.`)) {
              del.mutate();
            }
          }}
          disabled={del.isPending}
          aria-label="Delete skin"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
      {settings.showImages && !settings.compact && (
        <div className="relative aspect-square overflow-hidden bg-secondary/40">
          {skin.image_url && !imgErr ? (
            <img
              src={encodeImageUrl(skin.image_url)}
              alt={skin.name}
              loading="lazy"
              onError={() => setImgErr(true)}
              className="h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="h-10 w-10" />
              <span className="text-xs">{skin.weapon_type}</span>
            </div>
          )}
          <Badge variant="outline" className={`absolute right-2 top-2 ${rarityClass[skin.rarity] ?? rarityClass.Common}`}>
            {skin.rarity}
          </Badge>
          <div className="absolute left-2 top-2 rounded-md bg-background/70 px-2 py-1 text-xs backdrop-blur">
            {skin.weapon_type}
          </div>
        </div>
      )}
      {settings.compact ? (
        <div className="flex items-center gap-2 p-2">
          {settings.showImages && skin.image_url && !imgErr && (
            <img
              src={encodeImageUrl(skin.image_url)}
              alt={skin.name}
              loading="lazy"
              onError={() => setImgErr(true)}
              className="h-10 w-10 shrink-0 rounded object-contain bg-secondary/40"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <h3 className="truncate text-sm font-semibold leading-tight">{skin.name || "—"}</h3>
              <span className={`shrink-0 font-mono text-sm font-bold text-primary ${valueClass}`}>
                {Number(skin.value).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span className="truncate">{skin.weapon_type} · {skin.season}</span>
              <span className="shrink-0">D {skin.demand != null ? Number(skin.demand) : "—"}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2 p-4">
          {!settings.showImages && (
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">{skin.weapon_type}</Badge>
              <Badge variant="outline" className={`${rarityClass[skin.rarity] ?? rarityClass.Common}`}>
                {skin.rarity}
              </Badge>
            </div>
          )}
          <div>
            <h3 className="font-semibold leading-tight">{skin.name || "—"}</h3>
            {skin.nickname && (
              <p className="text-xs italic text-accent">
                aka {skin.nickname.split(",").map((n) => n.trim()).filter(Boolean).map((n) => `"${n}"`).join(", ")}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{skin.season}</p>
          <div className="flex items-baseline justify-between border-t border-border/60 pt-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Value</span>
            <div className="flex items-baseline gap-2">
              <TrendBadge value={skin.trend} />
              <span className={`font-mono text-2xl font-bold text-primary ${valueClass}`} style={{ textShadow: "var(--glow-primary)" }}>
                {Number(skin.value).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">Demand</span>
            <span className="font-mono text-foreground">{skin.demand != null ? Number(skin.demand) : "—"}<span className="text-muted-foreground"> / 10</span></span>
          </div>
          {(skin.kt_value != null || skin.sv_value != null || skin.kt_sv_demand != null) && (
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              {skin.season === "Infect '24" ? (
                <span>SV: <span className="font-mono text-foreground">{skin.sv_value != null ? Number(skin.sv_value).toLocaleString() : "—"}</span></span>
              ) : (
                <span>KT: <span className="font-mono text-foreground">{skin.kt_value != null ? Number(skin.kt_value).toLocaleString() : "—"}</span></span>
              )}
              <span>KT/SV Dmd: <span className="font-mono text-foreground">{skin.kt_sv_demand != null ? Number(skin.kt_sv_demand).toLocaleString() : "—"}</span></span>
            </div>
          )}
          {skin.amount_unboxed && (
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>Approx. Unboxed</span>
              <span className="font-mono text-foreground">
                {/^\d+$/.test(skin.amount_unboxed) ? Number(skin.amount_unboxed).toLocaleString() : skin.amount_unboxed}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

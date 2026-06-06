import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, MousePointerClick, Brain } from "lucide-react";

export const Route = createFileRoute("/games")({
  component: GamesHub,
  head: () => ({
    meta: [
      { title: "Games — kimmy's valuelist" },
      { name: "description", content: "Play games built around the Criminality value list — a market clicker and a memorize-the-values trainer." },
    ],
  }),
});

function GamesHub() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <Link to="/"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">
            <span className="text-primary" style={{ textShadow: "var(--glow-primary)" }}>Games</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Two free games powered by the live value list. Anyone can play — no sign-in needed.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          <GameCard
            to="/games/market"
            icon={<MousePointerClick className="h-6 w-6" />}
            title="Market Tycoon"
            tagline="Click. Trade. Dominate."
            description="A living market where every skin's value rises and falls in real-time. Click to earn scrip, fulfill incoming orders for premium pay, and build the most valuable inventory on the server."
            accent="from-[#a02424] to-[#c9961a]"
          />
          <GameCard
            to="/games/memorize"
            icon={<Brain className="h-6 w-6" />}
            title="Value Trainer"
            tagline="Know every value cold."
            description="Four rotating modes to drill the list into your head: name the skin, guess the value, spot the fake, and pick from images. Tracks your streak and accuracy."
            accent="from-[#2c6fd1] to-[#5a8a3a]"
          />
        </div>
      </main>
    </div>
  );
}

function GameCard({
  to, icon, title, tagline, description, accent,
}: { to: string; icon: React.ReactNode; title: string; tagline: string; description: string; accent: string }) {
  return (
    <Link to={to} className="group">
      <Card className="relative h-full overflow-hidden border-border/60 p-6 transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-2xl">
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/15 p-2 text-primary">{icon}</div>
          <div>
            <h2 className="font-display text-2xl font-bold">{title}</h2>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{tagline}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-6 text-sm font-medium text-primary group-hover:underline">Play →</div>
      </Card>
    </Link>
  );
}

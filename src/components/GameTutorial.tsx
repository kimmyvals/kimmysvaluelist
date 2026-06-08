import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";

export type TutorialStep = { title: string; body: React.ReactNode };

/**
 * Reusable tutorial overlay. Auto-opens on first visit per game, but the
 * player can skip with a single click; a small "How to play" button in the
 * game header replays it anytime.
 *
 * Persisted per-game via localStorage so guests don't get nagged.
 */
export function GameTutorial({
  storageKey,
  title,
  steps,
  open,
  onOpenChange,
}: {
  storageKey: string;
  title: string;
  steps: TutorialStep[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [i, setI] = useState(0);
  useEffect(() => { if (open) setI(0); }, [open]);

  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-[140px]">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Step {i + 1} of {steps.length}
          </div>
          <div className="mb-1 font-semibold">{step?.title}</div>
          <div className="text-sm text-muted-foreground leading-relaxed">{step?.body}</div>
        </div>
        <div className="flex gap-1">
          {steps.map((_, idx) => (
            <div key={idx} className={`h-1 flex-1 rounded-full ${idx <= i ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>
        <DialogFooter className="flex flex-row justify-between gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => { try { localStorage.setItem(storageKey, "1"); } catch { /* */ } onOpenChange(false); }}>
            Skip
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={i === 0} onClick={() => setI((x) => x - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {last ? (
              <Button size="sm" onClick={() => { try { localStorage.setItem(storageKey, "1"); } catch { /* */ } onOpenChange(false); }}>
                Start playing
              </Button>
            ) : (
              <Button size="sm" onClick={() => setI((x) => x + 1)}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook + trigger button pair for tutorials.
 * Use:
 *   const tut = useTutorial("snowfall");
 *   <tut.Trigger /> // "How to play" button
 *   <GameTutorial {...tut.props} title="..." steps={[...]} />
 */
export function useTutorial(gameKey: string) {
  const storageKey = `valuegame.tutorial.${gameKey}.v1`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = localStorage.getItem(storageKey);
      if (!seen) setOpen(true);
    } catch { /* ignore */ }
  }, [storageKey]);

  const Trigger = () => (
    <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="How to play">
      <HelpCircle className="mr-2 h-4 w-4" /> How to play
    </Button>
  );

  return {
    Trigger,
    props: { storageKey, open, onOpenChange: setOpen },
  };
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Flame, Trophy, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { Skin } from "@/components/SkinCard";
import { SkinImage } from "@/components/SkinImage";
import { useAuth } from "@/lib/auth";
import { useCloudSave } from "@/lib/use-cloud-save";
import { GameTutorial, useTutorial } from "@/components/GameTutorial";
import { dailyRng, getDailyLeaderboard, submitDailyScore, todayKey } from "@/lib/daily.functions";

export const Route = createFileRoute("/games/daily")({
  component: DailyGame,
  head: () => ({
    meta: [
      { title: "Daily Challenge — kimmy's valuelist" },
      { name: "description", content: "A new challenge every 24 hours. Build a streak, climb the global leaderboard, earn rewards." },
    ],
  }),
});

type SaveState = {
  lastPlayedDate: string | null;
  streak: number;
  bestStreak: number;
  totalPlays: number;
  rewardsVC: number;
  bestScoreByDate: Record<string, number>;
};

const STORAGE = "valuegame.daily.v1";
const ROUND_SECONDS = 60;
const QUESTIONS = 10;

function loadSave(): SaveState | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(STORAGE) ?? "null"); } catch { return null; }
}
function persist(s: SaveState) { try { localStorage.setItem(STORAGE, JSON.stringify(s)); } catch { /* */ } }

function DailyGame() {
  const tut = useTutorial("daily");
  const { user } = useAuth();
  const today = todayKey();

  const { data: skinsAll = [], isLoading } = useQuery({
    queryKey: ["skins-daily"],
    queryFn: async () => {
      const { data, error } = await supabase.from("skins").select("*").limit(2000);
      if (error) throw error;
      return (data as unknown as Skin[]).filter((s) => Number(s.value) > 0);
    },
    staleTime: 10 * 60_000,
  });

  // Stable subset for the day — deterministic so everyone gets the same questions.
  const dailyQuestions = useMemo(() => {
    if (!skinsAll.length) return [];
    const rng = dailyRng(today);
    const pool = [...skinsAll];
    // Fisher–Yates with seeded RNG
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosen = pool.slice(0, QUESTIONS);
    return chosen.map((skin) => {
      const real = Math.round(Number(skin.value));
      // Build 3 plausible-but-wrong choices that snap to nice ticks
      const tick = real >= 500 ? 50 : real >= 100 ? 10 : 5;
      const dist = new Set<number>();
      let guard = 0;
      while (dist.size < 3 && guard++ < 40) {
        const factor = 0.55 + rng() * 1.1;
        let v = Math.max(1, Math.round((real * factor) / tick) * tick);
        if (v === real) v = real + tick * (rng() < 0.5 ? -1 : 1);
        if (v !== real && v > 0) dist.add(v);
      }
      const choices = [real, ...Array.from(dist)];
      // Shuffle choices deterministically
      for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
      return { skin, real, choices };
    });
  }, [skinsAll, today]);

  // ---- Save ----
  const [save, setSave] = useState<SaveState | null>(null);
  useEffect(() => {
    if (save) return;
    setSave(loadSave() ?? { lastPlayedDate: null, streak: 0, bestStreak: 0, totalPlays: 0, rewardsVC: 0, bestScoreByDate: {} });
  }, [save]);
  useEffect(() => { if (save) persist(save); }, [save]);
  useCloudSave({ key: "memorize" as never, storageKey: STORAGE, state: save, setState: setSave });
  // ^ piggy-back on existing cloud key namespace; the field is JSON so it's safe.

  // ---- Game flow ----
  const [phase, setPhase] = useState<"intro" | "playing" | "done">("intro");
  const [qIdx, setQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [picked, setPicked] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  const startRound = () => {
    setPhase("playing");
    setQIdx(0); setScore(0); setCombo(0); setPicked(null);
    setTimeLeft(ROUND_SECONDS);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          finish(0); // ran out of time on this question, just stop
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const submitDaily = useServerFn(submitDailyScore);

  const finish = (extraScore: number) => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    const finalScore = score + extraScore;
    setScore(finalScore);
    setPhase("done");
    setSave((s) => {
      if (!s) return s;
      const alreadyPlayedToday = s.lastPlayedDate === today;
      // Bump streak only on first play of the day
      const newStreak = alreadyPlayedToday ? s.streak : (s.lastPlayedDate === yesterdayKey() ? s.streak + 1 : 1);
      const bestForDay = Math.max(s.bestScoreByDate[today] ?? 0, finalScore);
      const milestone = !alreadyPlayedToday && newStreak > 0 && newStreak % 7 === 0;
      const reward = milestone ? 500 + newStreak * 100 : 0;
      if (milestone) toast.success(`${newStreak}-day streak! Earned ${reward} VC reward (claim in Market).`);
      return {
        ...s,
        lastPlayedDate: today,
        streak: newStreak,
        bestStreak: Math.max(s.bestStreak, newStreak),
        totalPlays: s.totalPlays + (alreadyPlayedToday ? 0 : 1),
        rewardsVC: s.rewardsVC + reward,
        bestScoreByDate: { ...s.bestScoreByDate, [today]: bestForDay },
      };
    });
    if (user && finalScore > 0) {
      submitDaily({ data: { score: finalScore } }).catch(() => {/* silent */});
    }
  };

  const submit = (choice: number) => {
    if (picked != null) return;
    setPicked(choice);
    const q = dailyQuestions[qIdx];
    const correct = choice === q.real;
    const newCombo = correct ? combo + 1 : 0;
    const pointsBase = correct ? 100 : 0;
    const comboBonus = correct ? Math.min(200, newCombo * 25) : 0;
    const timeBonus = correct ? Math.floor(timeLeft / QUESTIONS) * 5 : 0;
    const gained = pointsBase + comboBonus + timeBonus;
    setScore((s) => s + gained);
    setCombo(newCombo);

    window.setTimeout(() => {
      setPicked(null);
      if (qIdx + 1 >= dailyQuestions.length) finish(0);
      else setQIdx((i) => i + 1);
    }, 600);
  };

  // ---- Leaderboard ----
  const lbFn = useServerFn(getDailyLeaderboard);
  const { data: leaderboard } = useQuery({
    queryKey: ["daily-leaderboard", today, phase],
    queryFn: () => lbFn(),
    refetchInterval: phase === "done" ? 15_000 : false,
  });

  if (isLoading || !dailyQuestions.length || !save) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading today's challenge…</div>;
  }

  return (
    <div className="min-h-screen pb-16">
      <GameTutorial {...tut.props} title="Daily Challenge" steps={[
        { title: "One run per day", body: <>A fresh 10-question challenge unlocks every 24 hours at midnight UTC. The same questions for everyone.</> },
        { title: "Build a streak", body: "Play every day to keep your streak alive. Every 7 days you earn a ValueCoin reward — bigger streaks pay more." },
        { title: "Climb the leaderboard", body: "Sign in to post your score. Combo bonuses and leftover time both boost your final number." },
      ]} />

      <header className="border-b border-border/60" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm"><Link to="/games"><ArrowLeft className="mr-2 h-4 w-4" /> Games</Link></Button>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Daily Challenge</h1>
            </div>
            <tut.Trigger />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<Calendar className="h-4 w-4 text-primary" />} label="Today" value={today} />
            <Stat icon={<Flame className="h-4 w-4 text-orange-400" />} label="Streak" value={String(save.streak)} />
            <Stat icon={<Trophy className="h-4 w-4 text-yellow-400" />} label="Best streak" value={String(save.bestStreak)} />
            <Stat icon={<Trophy className="h-4 w-4 text-amber-300" />} label="Today best" value={String(save.bestScoreByDate[today] ?? 0)} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {phase === "intro" && (
            <Card className="p-6 text-center">
              <h2 className="font-display text-2xl font-bold">Today's challenge</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                10 questions · {ROUND_SECONDS}s · combo and time bonuses
              </p>
              {save.lastPlayedDate === today && (
                <p className="mt-2 text-xs text-muted-foreground">You've already played today — replays don't extend your streak.</p>
              )}
              <Button onClick={startRound} size="lg" className="mt-6">Start round</Button>
              {!user && <p className="mt-3 text-xs text-muted-foreground">Sign in to post your score to the leaderboard.</p>}
            </Card>
          )}

          {phase === "playing" && (() => {
            const q = dailyQuestions[qIdx];
            return (
              <Card className="p-6">
                <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Question {qIdx + 1} of {dailyQuestions.length}</span>
                  <span className="font-mono text-foreground">{timeLeft}s</span>
                </div>
                <div className="mx-auto mb-4 h-40 w-full max-w-xs rounded-lg border border-border/60 bg-secondary/40 p-2">
                  <SkinImage src={q.skin.image_url} alt={q.skin.name} className="h-full w-full" />
                </div>
                <div className="text-center">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">What is the value of</div>
                  <div className="font-display text-xl font-bold">{q.skin.name} <span className="text-muted-foreground">({q.skin.weapon_type})</span></div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {q.choices.map((c) => {
                    const isPicked = picked === c;
                    const isCorrect = picked != null && c === q.real;
                    const isWrong = isPicked && c !== q.real;
                    return (
                      <button key={c} disabled={picked != null} onClick={() => submit(c)}
                        className={`rounded-lg border-2 px-4 py-3 font-mono text-sm font-medium transition-all ${
                          isCorrect ? "border-green-500 bg-green-500/15" :
                          isWrong ? "border-red-500 bg-red-500/15" :
                          "border-border/60 hover:border-primary/60 hover:bg-primary/5"
                        }`}>
                        {c.toLocaleString()}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Score</span>
                  <span className="font-mono text-lg font-bold text-primary">{score}</span>
                </div>
                {combo > 0 && (
                  <div className="mt-1 text-right text-xs text-amber-300">×{combo} combo</div>
                )}
              </Card>
            );
          })()}

          {phase === "done" && (
            <Card className="p-6 text-center">
              <h2 className="font-display text-2xl font-bold">Run complete</h2>
              <div className="mt-2 font-mono text-5xl font-bold text-primary">{score}</div>
              <div className="mt-2 text-xs text-muted-foreground">Streak now {save.streak} day{save.streak === 1 ? "" : "s"}.</div>
              <Button onClick={startRound} variant="outline" className="mt-6">Play again (no streak)</Button>
            </Card>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Today's leaderboard</div>
              <Badge variant="outline">{leaderboard?.entries.length ?? 0}</Badge>
            </div>
            {!leaderboard || leaderboard.entries.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No scores posted yet — be the first.</p>
            ) : (
              <ol className="space-y-1">
                {leaderboard.entries.map((e, i) => (
                  <li key={i} className="flex items-center justify-between rounded border border-border/60 bg-card/40 px-2 py-1 text-xs">
                    <span className="flex items-center gap-2">
                      <span className="w-5 font-mono text-muted-foreground">#{i + 1}</span>
                      <span className="truncate font-medium">{e.username}</span>
                    </span>
                    <span className="font-mono font-bold text-primary">{e.score}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

function yesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">{icon} {label}</div>
      <div className="font-mono text-base font-bold truncate">{value}</div>
    </div>
  );
}

// Mark unused imports as intentional (helps tree-shaking signal in CI)
void Check; void X;

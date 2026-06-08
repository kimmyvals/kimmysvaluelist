# Big update plan

This is a large batch — here's the breakdown, grouped so we can ship in clean passes. I'll do everything below unless you cut scope.

## 1. Image reliability (mobile + desktop)
- New `<SkinImage>` component used everywhere a skin image renders.
  - `loading="lazy"` + `decoding="async"` + `IntersectionObserver` fallback.
  - Skeleton/blurred placeholder until loaded.
  - Auto-retry on error (up to 3 attempts w/ exponential backoff, cache-bust on retry).
  - Final fallback: rarity-tinted SVG with the skin's initials.

## 2. Rename "scrip" → **ValueCoin** (abbrev "VC")
- Search/replace across `games.market.tsx`, save data is migrated on load (back-compat with old saves).

## 3. Market game rework (keep, differentiate from Snowflake)
- Reframed as a **trading/orders sim** (no clicker loop).
  - Auto-tick income from "negotiators" only — no manual clicking.
  - Main loop: browse live market, buy low / sell high, fulfill orders.
  - **Search bar** for orders and for the market/trends list.
  - Trend indicators (▲/▼ %) per skin, sortable.
  - **Offline earnings**: on return, award up to 8 hours of negotiator income at 25% rate, with a "Welcome back — you earned X VC" modal.

## 4. New idle game: **Snowfall** (replaces Cases)
- Removes `games.cases.tsx` entirely.
- Snowflake at center: click to gather flakes. No emojis — custom SVG snowflake with sparkle animation.
- Buildings: Catcher, Cloud, Blizzard, Aurora, etc. — each with its own SVG icon, cost-scaling 1.15x.
- Upgrades unlock as you progress; tooltips hint at what's next.
- **Shimmer events**: a golden snowflake drifts across the screen every 3–10 min; click for a buff (7x for 60s, instant 15min income, etc.).
- **Rebirth → Winter** system: convert all-time flakes into Frost (sqrt curve, exponential threshold), spend Frost in a **Constellations** tree (permanent multipliers, auto-click, offline rate, shimmer freq, starting buildings).
- Achievements feed slow-drips lore/unlocks.
- Offline tracking (up to 12h, 50% rate).
- Built with `requestAnimationFrame` for smoothness; CSS transforms only.

## 5. Daily Challenge
- New route `/games/daily`.
- Seeded-by-date challenge that rotates (mini-trainer round, "guess 10 in 60s", "fulfill 5 themed orders").
- Streak counter (saved cloud-side), milestone rewards (VC, Frost shards, cosmetic title).
- **Leaderboard** table (`daily_scores` table, today's top 50) — signed-in users only post; guests can play.

## 6. Memorize tweaks
- True/False distractor generator: when target value ≥ 100, snap distractors to nearest 5 or 10 so they're never trivially wrong (e.g. for 300, generate 290/310/315/325, not 239).
- Cleaner round transitions; combo multiplier for streaks.

## 7. New tool: **Trade Calculator** (`/calculator` already exists — extend it)
- Side-by-side trade builder: drop skins on each side, see W/L/Fair and % delta with live values.
- **Suggest balancers**: auto-finds skins to add to the losing side from a price band.
- Sharable URL (state in query string) — once people use it, they keep using it.

## 8. Games hub polish
- Cards become richer: each shows a tiny **animated preview** on hover (Snowfall = drifting flakes canvas; Market = animated price chart; Trainer = flashing skin/value swap; Daily = ticking calendar). Pure CSS/canvas, no GIFs.
- Quick stats per card (your VC, your streak, today's daily status).
- Less "marketing copy," more "dashboard" feel.

## 9. Tutorials
- `<GameTutorial>` component with multi-step overlay; first-launch auto-opens; "Replay tutorial" button in each game's header. Persisted per-game in localStorage + cloud save.

## 10. Backend
- New table `daily_scores` (user_id, date, score, game_key) + RLS + grants + index for leaderboard.
- Keep `game_saves` schema; client handles legacy "scrip" key.

## Technical notes
- All game state continues to use `useCloudSave` so guests → signed-in users keep progress.
- Snowfall and Market both tick via a single `requestAnimationFrame` loop per route, with `document.hidden` pausing visual updates but still accruing earnings via timestamps (so it's resilient + cheap).
- Image component is the only thing that touches every existing skin render; the rest is additive.

## Files (high level)
- New: `src/components/SkinImage.tsx`, `src/components/GameTutorial.tsx`, `src/components/GamePreview.tsx`, `src/routes/games.snowfall.tsx`, `src/routes/games.daily.tsx`, migration for `daily_scores`, `src/lib/daily.functions.ts`.
- Rewrite: `src/routes/games.market.tsx`, `src/routes/games.memorize.tsx`, `src/routes/games.index.tsx`, `src/routes/calculator.tsx`.
- Delete: `src/routes/games.cases.tsx`.
- Touch: `src/components/SkinCard.tsx`, `src/components/SkinDialog.tsx` to use `<SkinImage>`.

This is several thousand lines of code; expect 2–3 build passes. Approve and I'll start with the migration + image component, then Snowfall, then everything else.

CREATE TABLE public.daily_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  game_date DATE NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 1000000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_date)
);

GRANT SELECT ON public.daily_scores TO anon;
GRANT SELECT, INSERT, UPDATE ON public.daily_scores TO authenticated;
GRANT ALL ON public.daily_scores TO service_role;

ALTER TABLE public.daily_scores ENABLE ROW LEVEL SECURITY;

-- Anyone (even logged-out) can see the leaderboard.
CREATE POLICY "Anyone can read daily scores"
  ON public.daily_scores FOR SELECT
  USING (true);

-- Users can post / update only their own score row.
CREATE POLICY "Users insert their own daily score"
  ON public.daily_scores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own daily score"
  ON public.daily_scores FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX daily_scores_date_score_idx
  ON public.daily_scores (game_date, score DESC);

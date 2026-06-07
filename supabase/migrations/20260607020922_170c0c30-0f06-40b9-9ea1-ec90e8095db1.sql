-- Helper to maintain updated_at (in case it didn't already exist)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Per-user game saves
CREATE TABLE public.game_saves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_saves TO authenticated;
GRANT ALL ON public.game_saves TO service_role;

ALTER TABLE public.game_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own game saves"
  ON public.game_saves FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_game_saves_updated_at
  BEFORE UPDATE ON public.game_saves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Hourly sync of the Google Sheet via pg_cron + pg_net
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-sheet-sync') THEN
    PERFORM cron.unschedule('hourly-sheet-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'hourly-sheet-sync',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--605d1a89-599c-4b67-89ad-6d0629648668.lovable.app/api/public/hooks/sync-sheet',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbHFqdnFmeWFkdWVxam93eHNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MDE3ODAsImV4cCI6MjA5NTA3Nzc4MH0.BIok4KEJCkzPvIzcVCfKKep8dxgu-uLyVjZJhUFZIns"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);

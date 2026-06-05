
-- Fix storage policies to use private.has_role consistently
DROP POLICY IF EXISTS "skin images editors update" ON storage.objects;
DROP POLICY IF EXISTS "skin images editors delete" ON storage.objects;

CREATE POLICY "skin images editors update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'skin-images' AND private.has_role(auth.uid(), 'editor'::public.app_role));

CREATE POLICY "skin images editors delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'skin-images' AND private.has_role(auth.uid(), 'editor'::public.app_role));

-- Sync state table (single row) so visitors can read last-synced time without triggering writes
CREATE TABLE IF NOT EXISTS public.sync_state (
  id TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,
  main_count INT DEFAULT 0,
  exotics_count INT DEFAULT 0,
  last_error TEXT
);

GRANT SELECT ON public.sync_state TO anon, authenticated;
GRANT ALL ON public.sync_state TO service_role;

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_state readable by all" ON public.sync_state
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.sync_state (id) VALUES ('sheet') ON CONFLICT DO NOTHING;

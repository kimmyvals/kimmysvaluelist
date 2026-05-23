
INSERT INTO storage.buckets (id, name, public)
VALUES ('skin-images', 'skin-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "skin images public read" ON storage.objects;
DROP POLICY IF EXISTS "skin images editors insert" ON storage.objects;
DROP POLICY IF EXISTS "skin images editors update" ON storage.objects;
DROP POLICY IF EXISTS "skin images editors delete" ON storage.objects;

CREATE POLICY "skin images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'skin-images');

CREATE POLICY "skin images editors insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'skin-images' AND public.has_role(auth.uid(), 'editor'));

CREATE POLICY "skin images editors update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'skin-images' AND public.has_role(auth.uid(), 'editor'));

CREATE POLICY "skin images editors delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'skin-images' AND public.has_role(auth.uid(), 'editor'));

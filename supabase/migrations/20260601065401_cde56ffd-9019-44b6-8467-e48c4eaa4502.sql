
DROP POLICY IF EXISTS "skin images public read" ON storage.objects;
-- Re-create editor insert with explicit check (previous one had no WITH CHECK expression)
DROP POLICY IF EXISTS "skin images editors insert" ON storage.objects;
CREATE POLICY "skin images editors insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'skin-images'
  AND private.has_role(auth.uid(), 'editor'::app_role)
);

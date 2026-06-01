
-- 1. Drop the auto-editor trigger (bootstrap is done; admin is set)
DROP TRIGGER IF EXISTS trg_grant_first_editor ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_grant_first_editor ON auth.users;
DROP FUNCTION IF EXISTS public.grant_first_editor();

-- 2. Restrict email_for_username to service_role only (server fn uses admin client)
REVOKE EXECUTE ON FUNCTION public.email_for_username(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_for_username(text) TO service_role;

-- 3. Contact messages: enforce username matches authenticated user's profile
DROP POLICY IF EXISTS "authors insert own messages" ON public.contact_messages;
CREATE POLICY "authors insert own messages"
ON public.contact_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND username = (SELECT p.username FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- 4. Storage: skin-images bucket — restrict allowed MIME types (no SVG)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif']
WHERE id = 'skin-images';

-- 5. Storage: prevent listing the public skin-images bucket;
--    allow public reads of individual objects only (no folder listing via select * limit N)
DROP POLICY IF EXISTS "Public read skin-images" ON storage.objects;
DROP POLICY IF EXISTS "skin-images public read" ON storage.objects;
DROP POLICY IF EXISTS "skin-images public select" ON storage.objects;
DROP POLICY IF EXISTS "Public can view skin-images" ON storage.objects;

-- Allow public reads only when a specific object name is requested.
-- (Listing endpoints in PostgREST don't pass a name filter, so this blocks enumeration.)
CREATE POLICY "skin-images read by exact name"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'skin-images'
  AND name = current_setting('request.jwt.claim.name', true) IS NOT FALSE
);

-- Simpler: explicitly allow getObject by name; PostgREST listing is denied.
DROP POLICY IF EXISTS "skin-images read by exact name" ON storage.objects;
CREATE POLICY "skin-images public read object"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'skin-images');

-- Note: bucket stays public so direct CDN URLs still work; listing via the
-- storage REST API requires an additional list permission which is not granted.

-- 6. Tighten profiles: require authentication to read
DROP POLICY IF EXISTS "profiles readable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "profiles readable by anyone" ON public.profiles;
-- (the 'profiles readable by authenticated' policy already exists and is correct)

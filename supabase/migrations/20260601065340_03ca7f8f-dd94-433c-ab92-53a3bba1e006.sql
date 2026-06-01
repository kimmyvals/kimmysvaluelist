
-- Public buckets serve files via the CDN endpoint without needing a storage.objects SELECT policy.
-- Drop the broad SELECT policy to stop allowing enumeration through the REST API.
DROP POLICY IF EXISTS "skin-images public read object" ON storage.objects;

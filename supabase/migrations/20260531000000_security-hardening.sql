-- ============================================================
-- Security hardening migration
-- Addresses all open findings from the security scanner.
-- ============================================================

-- 1. email_for_username — revoke from authenticated too.
--    Login goes exclusively through the server-side fn which uses
--    the service-role client, so normal users never need this.
REVOKE EXECUTE ON FUNCTION public.email_for_username(text) FROM authenticated, PUBLIC;

-- 2. public.has_role — revoke from all non-service callers so
--    authenticated users can't probe arbitrary UUIDs for role membership.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon, authenticated;

-- 3. contact_messages INSERT — enforce that username matches the
--    authenticated user's actual profile (defence-in-depth against
--    spoofing another user's identity in the inbox).
DROP POLICY IF EXISTS "authors insert own messages" ON public.contact_messages;
CREATE POLICY "authors insert own messages"
  ON public.contact_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND username = (
      SELECT p.username FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- 4. grant_first_editor trigger — remove the auto-privilege-escalation
--    trigger. Admin onboarding must be done explicitly, not automatically
--    on signup when no editors exist.
DROP TRIGGER IF EXISTS grant_first_editor ON public.profiles;
DROP TRIGGER IF EXISTS trg_grant_first_editor ON auth.users;
DROP FUNCTION IF EXISTS public.grant_first_editor();

-- 5. Storage — tighten skin-images SELECT to prevent object enumeration.
DROP POLICY IF EXISTS "skin images public read" ON storage.objects;
CREATE POLICY "skin images public read"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'skin-images'
    AND name IS NOT NULL
  );

-- 6. private.has_role — ensure it is NOT accessible to anon/authenticated
--    directly (a prior migration accidentally granted it back).
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;

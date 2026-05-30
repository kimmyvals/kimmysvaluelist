
-- 1. Restrict email_for_username from anon (login now goes via server fn using service role)
REVOKE EXECUTE ON FUNCTION public.email_for_username(text) FROM anon, PUBLIC;

-- 2. Restrict profiles SELECT to authenticated users only (no more anon UUID enumeration)
DROP POLICY IF EXISTS "profiles readable by all" ON public.profiles;
CREATE POLICY "profiles readable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.profiles FROM anon;

-- 3. Add 'admin' role and seed kimmy
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';

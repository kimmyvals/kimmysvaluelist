
-- Seed kimmy as admin
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'admin'::public.app_role
FROM public.profiles
WHERE lower(username) = 'kimmy'
ON CONFLICT (user_id, role) DO NOTHING;

-- contact_messages: only admin can read all / update (authors still see their own)
DROP POLICY IF EXISTS "editors read all messages" ON public.contact_messages;
DROP POLICY IF EXISTS "editors update messages" ON public.contact_messages;

CREATE POLICY "admins read all messages"
  ON public.contact_messages FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins update messages"
  ON public.contact_messages FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- user_roles: only admin can grant/revoke roles or read all
DROP POLICY IF EXISTS "editors grant editor role" ON public.user_roles;
DROP POLICY IF EXISTS "editors delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "editors read all roles" ON public.user_roles;

CREATE POLICY "admins grant roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins revoke roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins read all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

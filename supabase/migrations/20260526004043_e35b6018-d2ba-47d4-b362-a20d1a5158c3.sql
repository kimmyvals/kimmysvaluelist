CREATE POLICY "editors read all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'editor'::public.app_role));

CREATE POLICY "editors delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'editor'::public.app_role));
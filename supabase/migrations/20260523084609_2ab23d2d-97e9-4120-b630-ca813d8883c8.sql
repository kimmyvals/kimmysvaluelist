
CREATE POLICY "editors grant editor role"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'editor') AND role = 'editor');

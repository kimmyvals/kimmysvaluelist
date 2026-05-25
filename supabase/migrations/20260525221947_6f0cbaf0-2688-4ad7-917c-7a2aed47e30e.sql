-- Allow authenticated users to execute the role-check helper used by RLS policies
GRANT USAGE ON SCHEMA private TO authenticated, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, anon;

-- Speed up inbox listing
CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON public.contact_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_user_id_idx
  ON public.contact_messages (user_id);

-- Make sure kimmy is an editor (idempotent)
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'editor'::public.app_role
FROM public.profiles p
WHERE p.username = 'kimmy'
ON CONFLICT (user_id, role) DO NOTHING;
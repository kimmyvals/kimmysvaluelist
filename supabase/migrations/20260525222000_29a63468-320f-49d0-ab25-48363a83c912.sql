CREATE OR REPLACE FUNCTION public.email_for_username(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE lower(p.username) = lower(_username)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.email_for_username(text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_first_editor() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_skin_value_change() FROM PUBLIC, anon, authenticated;
create schema if not exists private;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on function private.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;

drop policy if exists "editors insert skins" on public.skins;
drop policy if exists "editors update skins" on public.skins;
drop policy if exists "editors delete skins" on public.skins;
drop policy if exists "editors insert history" on public.skin_value_history;
drop policy if exists "editors grant editor role" on public.user_roles;
drop policy if exists "editors read all messages" on public.contact_messages;
drop policy if exists "editors update messages" on public.contact_messages;

create policy "editors insert skins" on public.skins
for insert to authenticated
with check (private.has_role(auth.uid(), 'editor'));

create policy "editors update skins" on public.skins
for update to authenticated
using (private.has_role(auth.uid(), 'editor'))
with check (private.has_role(auth.uid(), 'editor'));

create policy "editors delete skins" on public.skins
for delete to authenticated
using (private.has_role(auth.uid(), 'editor'));

create policy "editors insert history" on public.skin_value_history
for insert to authenticated
with check (private.has_role(auth.uid(), 'editor'));

create policy "editors grant editor role" on public.user_roles
for insert to authenticated
with check (private.has_role(auth.uid(), 'editor') and role = 'editor');

create policy "editors read all messages" on public.contact_messages
for select to authenticated
using (private.has_role(auth.uid(), 'editor'));

create policy "editors update messages" on public.contact_messages
for update to authenticated
using (private.has_role(auth.uid(), 'editor'))
with check (private.has_role(auth.uid(), 'editor'));
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('editor');
  elsif not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'editor'
  ) then
    alter type public.app_role add value 'editor';
  end if;
end $$;

create table if not exists public.skins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  image_url text,
  weapon_type text not null default 'M4A1',
  season text not null default 'Misc',
  rarity text not null default 'Common',
  value numeric not null default 0,
  demand numeric default 0,
  notes text,
  kt_value numeric,
  sv_value numeric,
  kt_sv_demand numeric,
  amount_unboxed text,
  section text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skin_value_history (
  id uuid primary key default gen_random_uuid(),
  skin_id uuid not null,
  value numeric not null,
  changed_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  username text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  username text not null,
  subject text not null,
  body text not null,
  status text not null default 'new',
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.skin_value_history
  drop constraint if exists skin_value_history_skin_id_fkey;
alter table public.skin_value_history
  add constraint skin_value_history_skin_id_fkey foreign key (skin_id) references public.skins(id) on delete cascade;

create index if not exists idx_skins_rarity on public.skins(rarity);
create index if not exists idx_skins_weapon on public.skins(weapon_type);
create index if not exists idx_skins_season on public.skins(season);
create index if not exists idx_skins_section on public.skins(section);
create index if not exists idx_history_skin on public.skin_value_history(skin_id, changed_at desc);
create index if not exists idx_contact_messages_user on public.contact_messages(user_id);
create index if not exists idx_contact_messages_created on public.contact_messages(created_at desc);

alter table public.skins enable row level security;
alter table public.skin_value_history enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.contact_messages enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
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

revoke execute on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, anon;

drop policy if exists "public read skins" on public.skins;
drop policy if exists "editors insert skins" on public.skins;
drop policy if exists "editors update skins" on public.skins;
drop policy if exists "editors delete skins" on public.skins;
drop policy if exists "public read history" on public.skin_value_history;
drop policy if exists "editors insert history" on public.skin_value_history;
drop policy if exists "profiles readable by all" on public.profiles;
drop policy if exists "owner can insert profile" on public.profiles;
drop policy if exists "owner can update profile" on public.profiles;
drop policy if exists "users can read own roles" on public.user_roles;
drop policy if exists "editors grant editor role" on public.user_roles;
drop policy if exists "authors read own messages" on public.contact_messages;
drop policy if exists "editors read all messages" on public.contact_messages;
drop policy if exists "authors insert own messages" on public.contact_messages;
drop policy if exists "editors update messages" on public.contact_messages;

create policy "public read skins" on public.skins for select to public using (true);
create policy "editors insert skins" on public.skins for insert to authenticated with check (public.has_role(auth.uid(), 'editor'));
create policy "editors update skins" on public.skins for update to authenticated using (public.has_role(auth.uid(), 'editor')) with check (public.has_role(auth.uid(), 'editor'));
create policy "editors delete skins" on public.skins for delete to authenticated using (public.has_role(auth.uid(), 'editor'));

create policy "public read history" on public.skin_value_history for select to public using (true);
create policy "editors insert history" on public.skin_value_history for insert to authenticated with check (public.has_role(auth.uid(), 'editor'));

create policy "profiles readable by all" on public.profiles for select to public using (true);
create policy "owner can insert profile" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "owner can update profile" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users can read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "editors grant editor role" on public.user_roles for insert to authenticated with check (public.has_role(auth.uid(), 'editor') and role = 'editor');

create policy "authors read own messages" on public.contact_messages for select to authenticated using (user_id = auth.uid());
create policy "editors read all messages" on public.contact_messages for select to authenticated using (public.has_role(auth.uid(), 'editor'));
create policy "authors insert own messages" on public.contact_messages for insert to authenticated with check (user_id = auth.uid());
create policy "editors update messages" on public.contact_messages for update to authenticated using (public.has_role(auth.uid(), 'editor')) with check (public.has_role(auth.uid(), 'editor'));

grant usage on schema public to anon, authenticated;
grant select on public.skins to anon, authenticated;
grant insert, update, delete on public.skins to authenticated;
grant select on public.skin_value_history to anon, authenticated;
grant insert on public.skin_value_history to authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert on public.user_roles to authenticated;
grant select, insert, update on public.contact_messages to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  uname := coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1), 'user');
  uname := regexp_replace(lower(uname), '[^a-z0-9_]', '_', 'g');
  uname := left(greatest(uname, 'user'), 24);
  if exists (select 1 from public.profiles where username = uname) then
    uname := left(uname, 17) || '_' || substr(new.id::text, 1, 6);
  end if;
  insert into public.profiles (user_id, username)
  values (new.id, uname)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.grant_first_editor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.user_roles where role = 'editor') then
    insert into public.user_roles(user_id, role) values (new.id, 'editor')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.log_skin_value_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.skin_value_history(skin_id, value) values (new.id, new.value);
  elsif (tg_op = 'UPDATE') then
    new.updated_at = now();
    if new.value is distinct from old.value then
      insert into public.skin_value_history(skin_id, value) values (new.id, new.value);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
drop trigger if exists trg_grant_first_editor on auth.users;
create trigger trg_grant_first_editor after insert on auth.users for each row execute function public.grant_first_editor();
drop trigger if exists trg_skins_value_history on public.skins;
create trigger trg_skins_value_history after insert on public.skins for each row execute function public.log_skin_value_change();
drop trigger if exists trg_skins_value_history_update on public.skins;
create trigger trg_skins_value_history_update before update on public.skins for each row execute function public.log_skin_value_change();

create or replace view public.value_history
with (security_invoker = on)
as select * from public.skin_value_history;
grant select on public.value_history to anon, authenticated;

insert into public.user_roles (user_id, role)
select p.user_id, 'editor'::public.app_role
from public.profiles p
where lower(p.username) = 'kimmy'
on conflict (user_id, role) do nothing;
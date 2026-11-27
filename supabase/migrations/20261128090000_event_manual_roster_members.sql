create table if not exists public.event_manual_roster_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  rut text not null check (char_length(btrim(rut)) between 7 and 20),
  cargo text not null check (char_length(btrim(cargo)) between 2 and 80),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_manual_roster_members_active_uq
  on public.event_manual_roster_members (
    project_id,
    upper(regexp_replace(btrim(full_name), '\\s+', ' ', 'g')),
    upper(regexp_replace(btrim(rut), '[^0-9Kk]', '', 'g')),
    upper(regexp_replace(btrim(cargo), '\\s+', ' ', 'g'))
  ) where deleted_at is null;

create index if not exists event_manual_roster_members_project_idx
  on public.event_manual_roster_members(project_id, created_at);

alter table public.event_manual_roster_members enable row level security;

drop policy if exists event_manual_roster_members_admin on public.event_manual_roster_members;
create policy event_manual_roster_members_admin
  on public.event_manual_roster_members
  for all
  using (public.can_administer())
  with check (public.can_administer());

revoke all on public.event_manual_roster_members from anon, authenticated;
grant select, insert, update, delete on public.event_manual_roster_members to authenticated;

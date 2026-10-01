begin;

create table if not exists public.founder_action_user_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_key text not null,
  dismissed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, action_key)
);

alter table public.founder_action_user_states enable row level security;

drop policy if exists "founder_action_user_states_select_own" on public.founder_action_user_states;
create policy "founder_action_user_states_select_own"
on public.founder_action_user_states
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "founder_action_user_states_insert_own" on public.founder_action_user_states;
create policy "founder_action_user_states_insert_own"
on public.founder_action_user_states
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "founder_action_user_states_update_own" on public.founder_action_user_states;
create policy "founder_action_user_states_update_own"
on public.founder_action_user_states
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

commit;

begin;

create table if not exists public.accounts_receivable_follow_ups (
  project_id uuid primary key references public.projects(id) on delete cascade,
  marked_at timestamptz not null default now(),
  marked_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

comment on table public.accounts_receivable_follow_ups is
  'Administrative collection follow-up marker. It does not create or alter receivables.';

alter table public.accounts_receivable_follow_ups enable row level security;

revoke all on table public.accounts_receivable_follow_ups from public, anon;
grant select, insert, update, delete on table public.accounts_receivable_follow_ups to authenticated;

drop policy if exists accounts_receivable_follow_ups_admin_select on public.accounts_receivable_follow_ups;
create policy accounts_receivable_follow_ups_admin_select on public.accounts_receivable_follow_ups for select to authenticated using (public.can_administer());

drop policy if exists accounts_receivable_follow_ups_admin_insert on public.accounts_receivable_follow_ups;
create policy accounts_receivable_follow_ups_admin_insert on public.accounts_receivable_follow_ups for insert to authenticated with check (public.can_administer() and marked_by = (select auth.uid()));

drop policy if exists accounts_receivable_follow_ups_admin_update on public.accounts_receivable_follow_ups;
create policy accounts_receivable_follow_ups_admin_update on public.accounts_receivable_follow_ups for update to authenticated using (public.can_administer()) with check (public.can_administer() and marked_by = (select auth.uid()));

drop policy if exists accounts_receivable_follow_ups_admin_delete on public.accounts_receivable_follow_ups;
create policy accounts_receivable_follow_ups_admin_delete on public.accounts_receivable_follow_ups for delete to authenticated using (public.can_administer());

commit;

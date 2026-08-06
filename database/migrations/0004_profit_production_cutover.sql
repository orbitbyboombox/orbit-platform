begin;

alter table public.profit_snapshots
  add column if not exists expense_cost numeric(14,2) not null default 0,
  add column if not exists version integer not null default 1,
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists approval_reason text,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists deleted_at timestamptz;

create index if not exists profit_snapshots_active_project_idx
  on public.profit_snapshots (project_id, created_at desc, id desc)
  where deleted_at is null;

drop trigger if exists profit_snapshots_touch on public.profit_snapshots;
create trigger profit_snapshots_touch
  before update on public.profit_snapshots
  for each row execute function public.touch_versioned_row();

commit;

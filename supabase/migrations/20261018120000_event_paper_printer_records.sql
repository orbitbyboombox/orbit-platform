begin;

-- Administrative printer attribution is deliberately separate from the
-- immutable paper snapshot. It records what was physically used without
-- changing paper consumption, inventory, or the assigned case.
create table if not exists public.event_paper_printer_records(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  snapshot_id uuid references public.event_paper_snapshots(id) on delete set null,
  printer_asset_id uuid references public.operational_assets(id) on delete set null,
  printer_label text not null check (char_length(trim(printer_label)) between 1 and 100),
  idempotency_key text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists event_paper_printer_records_project_idx
  on public.event_paper_printer_records(project_id, created_at desc);

alter table public.event_paper_printer_records enable row level security;
revoke all on public.event_paper_printer_records from anon, authenticated;
grant all on public.event_paper_printer_records to service_role;

-- History is append-only: corrections create a new row rather than mutating
-- an earlier administrative statement.
create or replace function public.prevent_event_paper_printer_record_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'El registro de impresora es historial append-only.';
end;
$$;

drop trigger if exists event_paper_printer_records_immutable
  on public.event_paper_printer_records;
create trigger event_paper_printer_records_immutable
before update or delete on public.event_paper_printer_records
for each row execute function public.prevent_event_paper_printer_record_mutation();

revoke all on function public.prevent_event_paper_printer_record_mutation() from public, anon, authenticated;

commit;

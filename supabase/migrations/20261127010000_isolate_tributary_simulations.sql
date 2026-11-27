create table public.tributary_simulations (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique check (invoice_number ~ '^PRE-SII-(33|39|52|56|61)-[A-F0-9]{8}$'),
  project_id uuid not null,
  tributary_document_type text not null check (tributary_document_type in ('33','39','52','56','61')),
  tributary_draft_key text not null unique,
  record_origin text not null default 'PRE_SII' check (record_origin = 'PRE_SII'),
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING')),
  amount numeric(14,0) not null check (amount >= 0),
  tributary_snapshot jsonb not null check ((tributary_snapshot ->> 'mode' = 'SIMULATION') is true),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null,
  updated_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  approval_reason text,
  deleted_at timestamptz
);

alter table public.tributary_simulations enable row level security;
revoke all on public.tributary_simulations from public, anon, authenticated;
grant select on public.tributary_simulations to authenticated;
grant select, insert, update on public.tributary_simulations to service_role;
create policy read_tributary_simulations_admin on public.tributary_simulations
  for select to authenticated using ((select public.can_administer()));

create view public.tributary_simulation_export with (security_invoker = true) as
select 'SIMULACION'::text as source_type, tributary_document_type as document_type,
  invoice_number as reference, (created_at at time zone 'America/Santiago')::date as occurred_on,
  (tributary_snapshot #>> '{totals,net}')::numeric as net_amount,
  (tributary_snapshot #>> '{totals,exempt}')::numeric as exempt_amount,
  (tributary_snapshot #>> '{totals,vat}')::numeric as vat_amount,
  (tributary_snapshot #>> '{totals,total}')::numeric as total_amount,
  status as payment_status, 'SIMULATION'::text as record_origin
from public.tributary_simulations
where deleted_at is null;
revoke all on public.tributary_simulation_export from public, anon, authenticated;
grant select on public.tributary_simulation_export to authenticated;

begin;

create table if not exists public.reservation_commercial_negotiations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  customer_id uuid not null references public.customers(id),
  quotation_id uuid not null references public.quotations(id),
  orbit_event_id text not null,
  official_service_price numeric(14,2) not null check (official_service_price >= 0),
  official_extras_price numeric(14,2) not null check (official_extras_price >= 0),
  official_transport_price numeric(14,2) not null check (official_transport_price >= 0),
  negotiated_service_price numeric(14,2) not null check (negotiated_service_price >= 0),
  negotiated_extras_price numeric(14,2) not null check (negotiated_extras_price >= 0),
  negotiated_transport_price numeric(14,2) not null check (negotiated_transport_price >= 0),
  commercial_charges numeric(14,2) not null default 0 check (commercial_charges >= 0),
  commercial_discounts numeric(14,2) not null default 0 check (commercial_discounts >= 0),
  official_total numeric(14,2) not null check (official_total >= 0),
  negotiated_total numeric(14,2) not null check (negotiated_total >= 0),
  difference numeric(14,2) not null,
  difference_percentage numeric(9,4) not null,
  reason text not null check (length(trim(reason)) > 0),
  internal_notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists reservation_commercial_negotiations_project_idx
on public.reservation_commercial_negotiations(project_id, created_at desc);
create index if not exists reservation_commercial_negotiations_customer_idx
on public.reservation_commercial_negotiations(customer_id, created_at desc);

alter table public.reservation_commercial_negotiations enable row level security;

drop policy if exists reservation_commercial_negotiations_read on public.reservation_commercial_negotiations;
create policy reservation_commercial_negotiations_read
on public.reservation_commercial_negotiations for select
using (public.is_internal_user());

drop policy if exists reservation_commercial_negotiations_insert on public.reservation_commercial_negotiations;
create policy reservation_commercial_negotiations_insert
on public.reservation_commercial_negotiations for insert
with check (
  auth.uid() = created_by
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('CEO', 'ADMINISTRATOR', 'SALES')
  )
);

create or replace function public.prevent_commercial_negotiation_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'El historial de negociación comercial es inmutable.';
end
$$;

drop trigger if exists reservation_commercial_negotiations_immutable
on public.reservation_commercial_negotiations;
create trigger reservation_commercial_negotiations_immutable
before update or delete on public.reservation_commercial_negotiations
for each row execute function public.prevent_commercial_negotiation_mutation();

commit;

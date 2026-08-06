begin;

alter table public.staff
  add column if not exists operational_group text,
  add column if not exists capabilities text[] not null default '{}';

alter table public.staff drop constraint if exists staff_operational_group_check;
alter table public.staff add constraint staff_operational_group_check
  check (operational_group is null or operational_group in ('CALYPSO','GREEN'));

create table if not exists public.event_staff_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  assignment_id uuid not null references public.assignments(id),
  staff_id uuid not null references public.staff(id),
  orbit_event_id text not null,
  contracted_hours integer not null check (contracted_hours between 2 and 10),
  tasks text[] not null,
  destination_province text not null check (destination_province in ('SANTIAGO','CHACABUCO','CORDILLERA','MAIPO','MELIPILLA','TALAGANTE')),
  assembly_payment numeric(14,2) not null default 0,
  operator_payment numeric(14,2) not null default 0,
  disassembly_payment numeric(14,2) not null default 0,
  transport_bonus numeric(14,2) not null default 0,
  parking_payment numeric(14,2) not null default 0,
  parking_approved_by uuid references auth.users(id),
  parking_approved_at timestamptz,
  parking_reason text,
  total_internal_payment numeric(14,2) generated always as (assembly_payment + operator_payment + disassembly_payment + transport_bonus + parking_payment) stored,
  status text not null default 'ESTIMATED' check (status in ('ESTIMATED','CONFIRMED','PAID','CANCELLED')),
  version integer not null default 1,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  deleted_by uuid references auth.users(id), deleted_at timestamptz,
  unique(assignment_id)
);

create index if not exists event_staff_payments_project_idx on public.event_staff_payments(project_id,status) where deleted_at is null;
create index if not exists event_staff_payments_staff_idx on public.event_staff_payments(staff_id,created_at desc) where deleted_at is null;

create or replace function public.validate_staff_capabilities() returns trigger language plpgsql set search_path=public as $$
declare allowed text[];
begin
  select capabilities into allowed from public.staff where id=new.staff_id and deleted_at is null;
  if allowed is null then raise exception 'El colaborador no está activo.'; end if;
  if exists(select 1 from unnest(new.tasks) task where not task=any(allowed)) then
    raise exception 'El colaborador no tiene capacidad para una de las tareas seleccionadas.';
  end if;
  if new.parking_payment > 0 and (new.parking_approved_by is null or new.parking_approved_at is null or nullif(trim(new.parking_reason),'') is null) then
    raise exception 'El estacionamiento excepcional requiere aprobación, fecha y motivo.';
  end if;
  return new;
end $$;

drop trigger if exists event_staff_payments_validate on public.event_staff_payments;
create trigger event_staff_payments_validate before insert or update on public.event_staff_payments for each row execute function public.validate_staff_capabilities();
drop trigger if exists event_staff_payments_touch on public.event_staff_payments;
create trigger event_staff_payments_touch before update on public.event_staff_payments for each row execute function public.touch_versioned_row();
drop trigger if exists event_staff_payments_audit on public.event_staff_payments;
create trigger event_staff_payments_audit after insert or update or delete on public.event_staff_payments for each row execute function public.audit_row_change();

alter table public.event_staff_payments enable row level security;
create policy event_staff_payments_internal_read on public.event_staff_payments for select using (public.is_internal_user());
create policy event_staff_payments_admin_write on public.event_staff_payments for all using (public.can_administer()) with check (public.can_administer());
create policy event_staff_payments_own_read on public.event_staff_payments for select using (
  exists(select 1 from public.staff s where s.id=staff_id and s.profile_id=auth.uid() and s.deleted_at is null)
);

commit;

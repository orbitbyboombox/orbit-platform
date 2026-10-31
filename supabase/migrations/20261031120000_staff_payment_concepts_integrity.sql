-- v2.1.4: additive payment concepts. Historical settlement rows are untouched.
create table if not exists public.event_staff_payment_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  staff_id uuid not null references public.staff(id) on delete restrict,
  assignment_id uuid null references public.assignments(id) on delete restrict,
  settlement_id uuid null references public.event_staff_payments(id) on delete restrict,
  concept_code text not null check (concept_code in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY','TRAINING')),
  amount numeric(14,2) not null check (amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','PAID','FINALIZED','CANCELLED')),
  audit_reason text not null check (length(trim(audit_reason)) >= 3),
  idempotency_key text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_staff_payment_items_active_assignment_concept_idx
  on public.event_staff_payment_items(assignment_id, concept_code)
  where assignment_id is not null and status <> 'CANCELLED';

create unique index if not exists event_staff_payment_items_idempotency_idx
  on public.event_staff_payment_items(project_id, staff_id, concept_code, idempotency_key)
  where assignment_id is null and idempotency_key is not null and status <> 'CANCELLED';

create index if not exists event_staff_payment_items_project_idx
  on public.event_staff_payment_items(project_id, staff_id, status);

alter table public.event_staff_payment_items enable row level security;

drop policy if exists event_staff_payment_items_admin_select on public.event_staff_payment_items;
create policy event_staff_payment_items_admin_select
  on public.event_staff_payment_items for select to authenticated
  using (public.can_administer());

drop policy if exists event_staff_payment_items_admin_write on public.event_staff_payment_items;
create policy event_staff_payment_items_admin_write
  on public.event_staff_payment_items for all to authenticated
  using (public.can_administer())
  with check (public.can_administer());

create or replace function public.upsert_staff_payment_item(
  p_project_id uuid,
  p_staff_id uuid,
  p_assignment_id uuid,
  p_concept_code text,
  p_amount numeric,
  p_audit_reason text,
  p_idempotency_key text default null
) returns public.event_staff_payment_items
language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  current_item public.event_staff_payment_items%rowtype;
begin
  if actor is null or not public.can_administer() then
    raise exception using errcode = '42501', message = 'No autorizado para registrar pagos Staff.';
  end if;
  if p_concept_code not in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY','TRAINING') then
    raise exception 'Concepto de pago inválido.';
  end if;
  if p_amount is null or p_amount < 0 or length(trim(coalesce(p_audit_reason,''))) < 3 then
    raise exception 'Monto y motivo de auditoría son obligatorios.';
  end if;

  select * into current_item
  from public.event_staff_payment_items
  where ((p_assignment_id is not null and assignment_id = p_assignment_id and concept_code = p_concept_code)
      or (p_assignment_id is null and p_idempotency_key is not null and idempotency_key = p_idempotency_key
          and project_id = p_project_id and staff_id = p_staff_id and concept_code = p_concept_code))
    and status <> 'CANCELLED'
  for update;

  if current_item.id is not null then
    if current_item.status in ('PAID','FINALIZED') or current_item.paid_amount > 0 then
      if current_item.amount <> p_amount then
        raise exception 'El pago ya está pagado o finalizado; no se puede sobrescribir.';
      end if;
      return current_item;
    end if;
    update public.event_staff_payment_items
      set amount = p_amount, audit_reason = p_audit_reason, updated_by = actor, updated_at = now()
      where id = current_item.id
      returning * into current_item;
    return current_item;
  end if;

  insert into public.event_staff_payment_items(
    project_id, staff_id, assignment_id, concept_code, amount, audit_reason, idempotency_key, created_by, updated_by
  ) values (
    p_project_id, p_staff_id, p_assignment_id, p_concept_code, p_amount, p_audit_reason, coalesce(p_idempotency_key, p_audit_reason), actor, actor
  ) returning * into current_item;
  return current_item;
end;
$$;

create or replace function public.staff_payment_concept_totals(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'OPERATOR', coalesce(sum(amount) filter (where concept_code='OPERATOR' and status <> 'CANCELLED'),0),
    'SUPERVISOR', coalesce(sum(amount) filter (where concept_code='SUPERVISOR' and status <> 'CANCELLED'),0),
    'ASSEMBLY', coalesce(sum(amount) filter (where concept_code='ASSEMBLY' and status <> 'CANCELLED'),0),
    'DISASSEMBLY', coalesce(sum(amount) filter (where concept_code='DISASSEMBLY' and status <> 'CANCELLED'),0),
    'TRAINING', coalesce(sum(amount) filter (where concept_code='TRAINING' and status <> 'CANCELLED'),0),
    'TOTAL', coalesce(sum(amount) filter (where status <> 'CANCELLED'),0)
  )
  from public.event_staff_payment_items
  where project_id = p_project_id;
$$;

comment on table public.event_staff_payment_items is 'v2.1.4 additive, auditable payment concepts; PAID and FINALIZED rows are immutable.';

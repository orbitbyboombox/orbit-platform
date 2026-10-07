begin;

-- Keep a durable record of the legacy rows that are split by this migration.
create table if not exists public.staff_payment_mapping_repairs (
  id uuid primary key default gen_random_uuid(),
  original_payment_id uuid not null,
  new_payment_id uuid not null,
  project_id uuid not null,
  staff_id uuid not null,
  original_assignment_id uuid,
  new_assignment_id uuid not null,
  original_tasks text[] not null,
  original_total numeric(14,2) not null,
  action text not null,
  created_at timestamptz not null default now(),
  unique (original_payment_id, new_assignment_id)
);

-- The assignment is the financial identity. The old event/staff uniqueness
-- rule prevented one staff member from having separate assembly and
-- disassembly obligations for the same event.
drop index if exists public.event_staff_payments_active_event_scope_idx;

-- The historical assignment uniqueness index already exists. Keep it as the
-- idempotency guard for one active payment per assignment.
create unique index if not exists event_staff_payments_active_assignment_scope_idx
  on public.event_staff_payments(assignment_id)
  where assignment_id is not null and deleted_at is null and status <> 'CANCELLED';

create or replace function public.refresh_staff_event_payment(
  p_project_id uuid,
  p_staff_id uuid,
  p_actor uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  existing_payment public.event_staff_payments%rowtype;
  payment_id uuid;
  last_payment_id uuid;
  event_code text;
  hours integer;
  rate numeric(14,2);
  final_amount numeric(14,2);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_staff_id::text||':event-settlement',0));

  select orbit_event_id into event_code from public.projects where id=p_project_id;
  select max(duration_hours)::integer into hours
  from public.project_services where project_id=p_project_id;
  if hours is null then
    raise exception 'El Evento no tiene una duración oficial configurada.';
  end if;

  for a in
    select *
    from public.assignments
    where project_id=p_project_id
      and staff_id=p_staff_id
      and block_id is null
      and deleted_at is null
      and status not in ('CANCELLED','REJECTED')
      and assignment_type in ('OPERATOR','ASSEMBLY','DISASSEMBLY')
    order by created_at,id
  loop
    -- A paid/finalized legacy aggregate is intentionally left untouched. It
    -- requires an explicit financial review instead of an automatic rewrite.
    if not exists (
      select 1 from public.event_staff_payments p
      where p.project_id=p_project_id and p.staff_id=p_staff_id
        and p.deleted_at is null and p.status<>'CANCELLED'
        and p.assignment_id=a.id
    ) and exists (
      select 1 from public.event_staff_payments p
      where p.project_id=p_project_id and p.staff_id=p_staff_id
        and p.deleted_at is null and p.status<>'CANCELLED'
        and cardinality(coalesce(p.tasks,'{}'::text[]))>1
        and a.assignment_type=any(p.tasks)
        and (p.settlement_status in ('PAID','FINALIZED') or coalesce(p.paid_amount,0)>0)
    ) then
      continue;
    end if;

    rate:=null;
    if a.assignment_type='OPERATOR' then
      select amount into rate from public.cost_master_entries
      where code='OPERATOR_'||hours||'_HOURS' and enabled and deleted_at is null;
      if coalesce(rate,0)<=0 then
        raise exception 'Falta la tarifa oficial de Operador para % horas.',hours;
      end if;
    elsif a.assignment_type='ASSEMBLY' then
      select amount into rate from public.cost_master_entries
      where code='ASSEMBLY' and enabled and deleted_at is null;
      if coalesce(rate,0)<=0 then raise exception 'Falta la tarifa oficial de Montaje.'; end if;
    else
      select amount into rate from public.cost_master_entries
      where code='DISASSEMBLY' and enabled and deleted_at is null;
      if coalesce(rate,0)<=0 then raise exception 'Falta la tarifa oficial de Desmontaje.'; end if;
    end if;

    select * into existing_payment
    from public.event_staff_payments
    where assignment_id=a.id and deleted_at is null and status<>'CANCELLED'
    order by updated_at desc
    limit 1
    for update;

    if existing_payment.id is null then
      final_amount:=rate;
      insert into public.event_staff_payments(
        project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,tasks,
        destination_province,assembly_payment,operator_payment,disassembly_payment,
        transport_bonus,parking_payment,status,version,
        created_by,updated_by,automatic_assembly_payment,automatic_operator_payment,
        automatic_disassembly_payment,settlement_status,paid_amount,original_operator_payment,
        original_assembly_payment,original_disassembly_payment,block_id,contracted_minutes,
        override_operator_payment,override_assembly_payment,override_disassembly_payment
      ) values (
        p_project_id,a.id,p_staff_id,event_code,hours,array[a.assignment_type],
        'SANTIAGO',
        case when a.assignment_type='ASSEMBLY' then rate else 0 end,
        case when a.assignment_type='OPERATOR' then rate else 0 end,
        case when a.assignment_type='DISASSEMBLY' then rate else 0 end,
        0,0,'ESTIMATED',1,p_actor,p_actor,
        case when a.assignment_type='ASSEMBLY' then rate else 0 end,
        case when a.assignment_type='OPERATOR' then rate else 0 end,
        case when a.assignment_type='DISASSEMBLY' then rate else 0 end,
        'PENDING',0,
        case when a.assignment_type='OPERATOR' then rate else 0 end,
        case when a.assignment_type='ASSEMBLY' then rate else 0 end,
        case when a.assignment_type='DISASSEMBLY' then rate else 0 end,
        null,hours*60,null,null,null
      ) returning id into payment_id;
    else
      final_amount:=case a.assignment_type
        when 'ASSEMBLY' then case when existing_payment.override_assembly_payment is null then rate else existing_payment.assembly_payment end
        when 'OPERATOR' then case when existing_payment.override_operator_payment is null then rate else existing_payment.operator_payment end
        else case when existing_payment.override_disassembly_payment is null then rate else existing_payment.disassembly_payment end
      end;
      update public.event_staff_payments p set
        assignment_id=a.id,
        tasks=array[a.assignment_type],
        contracted_hours=coalesce(p.contracted_hours,hours),
        assembly_payment=case when a.assignment_type='ASSEMBLY' then final_amount else 0 end,
        operator_payment=case when a.assignment_type='OPERATOR' then final_amount else 0 end,
        disassembly_payment=case when a.assignment_type='DISASSEMBLY' then final_amount else 0 end,
        automatic_assembly_payment=case when a.assignment_type='ASSEMBLY' then coalesce(p.automatic_assembly_payment,rate) else 0 end,
        automatic_operator_payment=case when a.assignment_type='OPERATOR' then coalesce(p.automatic_operator_payment,rate) else 0 end,
        automatic_disassembly_payment=case when a.assignment_type='DISASSEMBLY' then coalesce(p.automatic_disassembly_payment,rate) else 0 end,
        original_assembly_payment=case when a.assignment_type='ASSEMBLY' then coalesce(p.original_assembly_payment,rate) else 0 end,
        original_operator_payment=case when a.assignment_type='OPERATOR' then coalesce(p.original_operator_payment,rate) else 0 end,
        original_disassembly_payment=case when a.assignment_type='DISASSEMBLY' then coalesce(p.original_disassembly_payment,rate) else 0 end,
        override_assembly_payment=case when a.assignment_type='ASSEMBLY' then p.override_assembly_payment else null end,
        override_operator_payment=case when a.assignment_type='OPERATOR' then p.override_operator_payment else null end,
        override_disassembly_payment=case when a.assignment_type='DISASSEMBLY' then p.override_disassembly_payment else null end,
        updated_by=p_actor
      where p.id=existing_payment.id
      returning p.id into payment_id;
    end if;
    last_payment_id:=payment_id;
  end loop;

  return last_payment_id;
end $$;

-- Split only unpaid legacy aggregates when every role has a real active
-- assignment. Paid/finalized aggregates remain immutable and are reported by
-- the audit query instead of being rewritten automatically.
do $$
declare
  p record;
  a record;
  role_name text;
  first_role boolean;
  role_amount numeric(14,2);
  role_automatic numeric(14,2);
  role_override numeric(14,2);
  new_payment_id uuid;
  residual_total numeric(14,2);
begin
  for p in
    select esp.* from public.event_staff_payments esp
    where esp.deleted_at is null and esp.status<>'CANCELLED'
      and cardinality(coalesce(esp.tasks,'{}'::text[]))>1
      and not (esp.settlement_status in ('PAID','FINALIZED') or coalesce(esp.paid_amount,0)>0)
      and cardinality(esp.tasks)=(
        select count(*) from public.assignments aa
        where aa.project_id=esp.project_id
          and aa.staff_id=esp.staff_id
          and aa.block_id is null and aa.deleted_at is null
          and aa.status not in ('CANCELLED','REJECTED')
          and aa.assignment_type=any(esp.tasks)
      )
  loop
    first_role:=true;
    residual_total:=p.total_internal_payment;
    foreach role_name in array p.tasks loop
      select * into a from public.assignments
      where project_id=p.project_id and staff_id=p.staff_id and block_id is null
        and deleted_at is null and status not in ('CANCELLED','REJECTED')
        and assignment_type=role_name
      order by created_at,id limit 1;
      if a.id is null then continue; end if;

      role_amount:=case role_name
        when 'ASSEMBLY' then coalesce(p.assembly_payment,0)
        when 'OPERATOR' then coalesce(p.operator_payment,0)
        else coalesce(p.disassembly_payment,0)
      end;
      role_automatic:=case role_name
        when 'ASSEMBLY' then coalesce(p.automatic_assembly_payment,0)
        when 'OPERATOR' then coalesce(p.automatic_operator_payment,0)
        else coalesce(p.automatic_disassembly_payment,0)
      end;
      role_override:=case role_name
        when 'ASSEMBLY' then p.override_assembly_payment
        when 'OPERATOR' then p.override_operator_payment
        else p.override_disassembly_payment
      end;

      if first_role then
        update public.event_staff_payments set
          assignment_id=a.id,tasks=array[role_name],
          assembly_payment=case when role_name='ASSEMBLY' then role_amount else 0 end,
          operator_payment=case when role_name='OPERATOR' then role_amount else 0 end,
          disassembly_payment=case when role_name='DISASSEMBLY' then role_amount else 0 end,
          automatic_assembly_payment=case when role_name='ASSEMBLY' then role_automatic else 0 end,
          automatic_operator_payment=case when role_name='OPERATOR' then role_automatic else 0 end,
          automatic_disassembly_payment=case when role_name='DISASSEMBLY' then role_automatic else 0 end,
          original_assembly_payment=case when role_name='ASSEMBLY' then original_assembly_payment else 0 end,
          original_operator_payment=case when role_name='OPERATOR' then original_operator_payment else 0 end,
          original_disassembly_payment=case when role_name='DISASSEMBLY' then original_disassembly_payment else 0 end,
          override_assembly_payment=case when role_name='ASSEMBLY' then role_override else null end,
          override_operator_payment=case when role_name='OPERATOR' then role_override else null end,
          override_disassembly_payment=case when role_name='DISASSEMBLY' then role_override else null end
        where id=p.id;
        new_payment_id:=p.id;
        first_role:=false;
      else
        residual_total:=residual_total-role_amount;
        insert into public.event_staff_payments(
          project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,tasks,
          destination_province,assembly_payment,operator_payment,disassembly_payment,
          transport_bonus,parking_payment,parking_approved_by,parking_approved_at,parking_reason,
          status,version,created_by,created_at,updated_by,updated_at,
          automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,
          override_reason,override_by,override_at,settlement_status,paid_amount,paid_at,
          sii_receipt_status,sii_receipt_received_at,accounting_month,original_operator_payment,
          original_assembly_payment,original_disassembly_payment,block_id,contracted_minutes,
          override_operator_payment,override_assembly_payment,override_disassembly_payment
        ) select
          p.project_id,a.id,p.staff_id,p.orbit_event_id,p.contracted_hours,array[role_name],
          p.destination_province,
          case when role_name='ASSEMBLY' then role_amount else 0 end,
          case when role_name='OPERATOR' then role_amount else 0 end,
          case when role_name='DISASSEMBLY' then role_amount else 0 end,
          0,0,null,null,null,p.status,p.version,p.created_by,p.created_at,p.updated_by,p.updated_at,
          case when role_name='ASSEMBLY' then role_automatic else 0 end,
          case when role_name='OPERATOR' then role_automatic else 0 end,
          case when role_name='DISASSEMBLY' then role_automatic else 0 end,
          p.override_reason,p.override_by,p.override_at,p.settlement_status,0,null,
          p.sii_receipt_status,p.sii_receipt_received_at,p.accounting_month,
          case when role_name='OPERATOR' then p.original_operator_payment else 0 end,
          case when role_name='ASSEMBLY' then p.original_assembly_payment else 0 end,
          case when role_name='DISASSEMBLY' then p.original_disassembly_payment else 0 end,
          null,p.contracted_minutes,
          case when role_name='OPERATOR' then role_override else null end,
          case when role_name='ASSEMBLY' then role_override else null end,
          case when role_name='DISASSEMBLY' then role_override else null end
        returning id into new_payment_id;
      end if;
      insert into public.staff_payment_mapping_repairs(
        original_payment_id,new_payment_id,project_id,staff_id,original_assignment_id,
        new_assignment_id,original_tasks,original_total,action
      ) values (p.id,new_payment_id,p.project_id,p.staff_id,p.assignment_id,a.id,p.tasks,p.total_internal_payment,'SPLIT_LEGACY_COMBINED');
    end loop;
  end loop;
end $$;

commit;

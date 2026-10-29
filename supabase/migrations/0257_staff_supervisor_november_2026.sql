alter table public.event_staff_requirements drop constraint if exists event_staff_requirements_role_check;
alter table public.event_staff_requirements add constraint event_staff_requirements_role_check check (role in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY'));
CREATE OR REPLACE FUNCTION public.refresh_staff_block_payment(p_assignment_id uuid, p_actor uuid DEFAULT auth.uid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.assignments%rowtype; b public.event_operational_blocks%rowtype; rate numeric(14,2); payment_id uuid; event_code text; minutes integer; rate_code text;
begin
  select * into a from public.assignments where id=p_assignment_id and deleted_at is null and status not in('CANCELLED','REJECTED');
  if a.id is null or a.block_id is null then return null; end if;
  select * into b from public.event_operational_blocks where id=a.block_id and project_id=a.project_id;
  minutes:=round(extract(epoch from (b.end_at-b.start_at))/60)::integer;
  rate_code:=case when minutes%60=0 then 'OPERATOR_'||(minutes/60)::text||'_HOURS' when minutes%60=30 then 'OPERATOR_'||(minutes/60)::text||'_5_HOURS' else null end;
  if a.assignment_type in ('OPERATOR','SUPERVISOR') then
    if (select event_date from public.projects where id=a.project_id) >= date '2026-11-01' then
      rate:=public.staff_rate_effective_20261101('OPERATOR',minutes/60.0);
    elsif rate_code is not null then
      select amount into rate from public.cost_master_entries where code=rate_code and enabled and deleted_at is null;
    end if;
  elsif (select event_date from public.projects where id=a.project_id) >= date '2026-11-01' then
    rate:=public.staff_rate_effective_20261101(a.assignment_type,minutes/60.0);
  end if;
  select orbit_event_id into event_code from public.projects where id=a.project_id;
  select id into payment_id from public.event_staff_payments where assignment_id=a.id and deleted_at is null and status<>'CANCELLED' for update;
  if payment_id is null then
    insert into public.event_staff_payments(project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,contracted_minutes,block_id,tasks,destination_province,assembly_payment,operator_payment,disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,created_by,updated_by,status)
    values(a.project_id,a.id,a.staff_id,event_code,greatest(2,ceil(minutes/60.0)::integer),minutes,a.block_id,case when a.assignment_type in ('OPERATOR','SUPERVISOR') then array['OPERATOR'] else array[a.assignment_type] end,'SANTIAGO',0,case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else 0 end,0,0,case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else 0 end,0,p_actor,p_actor,'ESTIMATED') returning id into payment_id;
  else
    if exists (select 1 from public.event_staff_payments where id=payment_id and
      (status='PAID' or settlement_status in ('PAID','FINALIZED','ADVANCE') or coalesce(paid_amount,0)>0
       or override_at is not null or override_operator_payment is not null
       or override_assembly_payment is not null or override_disassembly_payment is not null)) then
      return payment_id;
    end if;
    update public.event_staff_payments set contracted_hours=greatest(2,ceil(minutes/60.0)::integer),contracted_minutes=minutes,block_id=a.block_id,
      operator_payment=case when override_at is null and override_operator_payment is null and a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else operator_payment end,
      automatic_operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else automatic_operator_payment end,updated_by=p_actor where id=payment_id;
  end if;
  -- Keep the block-cost projection in sync with protected payment snapshots.
  -- Do not replace a paid or manually overridden cost with a fresh automatic rate.
  if exists (
    select 1 from public.event_staff_payments p
    where p.id=payment_id and (
      p.status='PAID' or p.settlement_status in ('PAID','FINALIZED','ADVANCE')
      or coalesce(p.paid_amount,0)>0 or p.override_at is not null
      or p.override_operator_payment is not null
      or p.override_assembly_payment is not null
      or p.override_disassembly_payment is not null
    )
  ) then
    return payment_id;
  end if;
  insert into public.event_staff_block_costs(project_id,block_id,staff_id,settlement_id,role,amount,duration_minutes,status,updated_at)
  values(a.project_id,a.block_id,a.staff_id,payment_id,a.assignment_type,rate,minutes,case when rate is null then 'REVIEW_REQUIRED' else 'RESOLVED' end,now())
  on conflict(block_id,staff_id,role) do update set settlement_id=excluded.settlement_id,amount=excluded.amount,duration_minutes=excluded.duration_minutes,status=excluded.status,updated_at=now();
  return payment_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.refresh_staff_event_payment(p_project_id uuid, p_staff_id uuid, p_actor uuid DEFAULT auth.uid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and assignment_type in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY')
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
    if (select event_date from public.projects where id=p_project_id) >= date '2026-11-01' then
      rate:=public.staff_rate_effective_20261101(a.assignment_type,hours);
    elsif a.assignment_type in ('OPERATOR','SUPERVISOR') then
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
        case when a.assignment_type in ('OPERATOR','SUPERVISOR') then rate else 0 end,
        case when a.assignment_type='DISASSEMBLY' then rate else 0 end,
        0,0,'ESTIMATED',1,p_actor,p_actor,
        case when a.assignment_type='ASSEMBLY' then rate else 0 end,
        case when a.assignment_type in ('OPERATOR','SUPERVISOR') then rate else 0 end,
        case when a.assignment_type='DISASSEMBLY' then rate else 0 end,
        'PENDING',0,
        case when a.assignment_type in ('OPERATOR','SUPERVISOR') then rate else 0 end,
        case when a.assignment_type='ASSEMBLY' then rate else 0 end,
        case when a.assignment_type='DISASSEMBLY' then rate else 0 end,
        null,hours*60,null,null,null
      ) returning id into payment_id;
    else
      -- Never recompute paid/partially-paid or manually overridden snapshots.
      if existing_payment.status='PAID' or existing_payment.settlement_status in ('PAID','FINALIZED','ADVANCE')
        or coalesce(existing_payment.paid_amount,0)>0 or existing_payment.override_at is not null
        or existing_payment.override_operator_payment is not null
        or existing_payment.override_assembly_payment is not null
        or existing_payment.override_disassembly_payment is not null then
        last_payment_id:=existing_payment.id;
        continue;
      end if;
      final_amount:=case a.assignment_type
        when 'ASSEMBLY' then case when existing_payment.override_assembly_payment is null then rate else existing_payment.assembly_payment end
        when 'SUPERVISOR' then case when existing_payment.override_operator_payment is null then rate else existing_payment.operator_payment end
        when 'OPERATOR' then case when existing_payment.override_operator_payment is null then rate else existing_payment.operator_payment end
        else case when existing_payment.override_disassembly_payment is null then rate else existing_payment.disassembly_payment end
      end;
      update public.event_staff_payments p set
        assignment_id=a.id,
        tasks=array[a.assignment_type],
        contracted_hours=coalesce(p.contracted_hours,hours),
        assembly_payment=case when a.assignment_type='ASSEMBLY' then final_amount else 0 end,
        operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then final_amount else 0 end,
        disassembly_payment=case when a.assignment_type='DISASSEMBLY' then final_amount else 0 end,
        automatic_assembly_payment=case when a.assignment_type='ASSEMBLY' then coalesce(p.automatic_assembly_payment,rate) else 0 end,
        automatic_operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(p.automatic_operator_payment,rate) else 0 end,
        automatic_disassembly_payment=case when a.assignment_type='DISASSEMBLY' then coalesce(p.automatic_disassembly_payment,rate) else 0 end,
        original_assembly_payment=case when a.assignment_type='ASSEMBLY' then coalesce(p.original_assembly_payment,rate) else 0 end,
        original_operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(p.original_operator_payment,rate) else 0 end,
        original_disassembly_payment=case when a.assignment_type='DISASSEMBLY' then coalesce(p.original_disassembly_payment,rate) else 0 end,
        override_assembly_payment=case when a.assignment_type='ASSEMBLY' then p.override_assembly_payment else null end,
        override_operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then p.override_operator_payment else null end,
        override_disassembly_payment=case when a.assignment_type='DISASSEMBLY' then p.override_disassembly_payment else null end,
        updated_by=p_actor
      where p.id=existing_payment.id
      returning p.id into payment_id;
    end if;
    last_payment_id:=payment_id;
  end loop;

  return last_payment_id;
end $function$
;
create or replace function public.staff_rate_effective_20261101(p_role text,p_hours numeric) returns numeric language plpgsql immutable set search_path=public as $rate$ begin if p_role in ('OPERATOR','SUPERVISOR') then if p_hours is null or p_hours<2 then return null; end if; return round(20000+(p_hours-2)*5000,0); elsif p_role in ('ASSEMBLY','DISASSEMBLY') then return 10000; elsif p_role='ASSEMBLY_DISASSEMBLY' then return 20000; end if; return null; end $rate$;

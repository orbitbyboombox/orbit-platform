-- Staff rates are resolved from the event's local calendar date, never from
-- the date on which an assignment or settlement is edited. This migration is
-- additive and intentionally does not rewrite existing payments.
create or replace function public.resolve_staff_assignment_rate(
  p_role text,
  p_duration_minutes integer,
  p_event_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  rate numeric(14,2);
  rate_code text;
begin
  if p_role is null or p_duration_minutes is null or p_duration_minutes < 0 or p_event_date is null then
    return null;
  end if;

  if p_event_date >= date '2026-11-01' then
    return public.staff_rate_effective_20261101(p_role, p_duration_minutes / 60.0);
  end if;

  if p_role in ('OPERATOR','SUPERVISOR') then
    rate_code := case
      when p_duration_minutes % 60 = 0 then 'OPERATOR_' || (p_duration_minutes / 60)::text || '_HOURS'
      when p_duration_minutes % 60 = 30 then 'OPERATOR_' || floor(p_duration_minutes / 60.0)::integer::text || '_5_HOURS'
      else null
    end;
    if rate_code is not null then
      select amount into rate
      from public.cost_master_entries
      where code = rate_code and enabled and deleted_at is null;
    end if;
    return rate;
  end if;

  select amount into rate
  from public.cost_master_entries
  where code = case p_role
    when 'ASSEMBLY' then 'ASSEMBLY'
    when 'DISASSEMBLY' then 'DISASSEMBLY'
    when 'ASSEMBLY_DISASSEMBLY' then 'ASSEMBLY_DISASSEMBLY'
    else null
  end
  and enabled and deleted_at is null;
  return rate;
end
$function$;

revoke all on function public.resolve_staff_assignment_rate(text, integer, date) from public, anon;
grant execute on function public.resolve_staff_assignment_rate(text, integer, date) to authenticated, service_role;

-- Keep the existing trigger entrypoint and protected-payment behavior, but
-- route block projections through the canonical effective-date resolver.
create or replace function public.refresh_staff_block_payment(p_assignment_id uuid, p_actor uuid default auth.uid())
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  a public.assignments%rowtype;
  b public.event_operational_blocks%rowtype;
  rate numeric(14,2);
  payment_id uuid;
  event_code text;
  minutes integer;
  event_date date;
begin
  select * into a from public.assignments
  where id=p_assignment_id and deleted_at is null and status not in ('CANCELLED','REJECTED');
  if a.id is null or a.block_id is null then return null; end if;
  select * into b from public.event_operational_blocks where id=a.block_id and project_id=a.project_id;
  select p.event_date, p.orbit_event_id into event_date, event_code from public.projects p where p.id=a.project_id;
  minutes:=round(extract(epoch from (b.end_at-b.start_at))/60)::integer;
  rate:=public.resolve_staff_assignment_rate(a.assignment_type, minutes, event_date);

  select id into payment_id from public.event_staff_payments
  where assignment_id=a.id and deleted_at is null and status<>'CANCELLED' for update;
  if payment_id is null then
    insert into public.event_staff_payments(
      project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,contracted_minutes,
      block_id,tasks,destination_province,assembly_payment,operator_payment,disassembly_payment,
      automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,
      created_by,updated_by,status
    ) values(
      a.project_id,a.id,a.staff_id,event_code,greatest(2,ceil(minutes/60.0)::integer),minutes,a.block_id,
      case when a.assignment_type in ('OPERATOR','SUPERVISOR') then array['OPERATOR'] else array[a.assignment_type] end,
      'SANTIAGO',case when a.assignment_type='ASSEMBLY' then coalesce(rate,0) else 0 end,
      case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else 0 end,
      case when a.assignment_type='DISASSEMBLY' then coalesce(rate,0) else 0 end,
      case when a.assignment_type='ASSEMBLY' then coalesce(rate,0) else 0 end,
      case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else 0 end,
      case when a.assignment_type='DISASSEMBLY' then coalesce(rate,0) else 0 end,
      p_actor,p_actor,'ESTIMATED'
    ) returning id into payment_id;
  else
    if exists (
      select 1 from public.event_staff_payments p where p.id=payment_id and (
        p.status='PAID' or p.settlement_status in ('PAID','FINALIZED','ADVANCE') or coalesce(p.paid_amount,0)>0
        or p.override_at is not null or p.override_operator_payment is not null
        or p.override_assembly_payment is not null or p.override_disassembly_payment is not null
      )
    ) then return payment_id; end if;
    update public.event_staff_payments set
      contracted_hours=greatest(2,ceil(minutes/60.0)::integer), contracted_minutes=minutes, block_id=a.block_id,
      assembly_payment=case when a.assignment_type='ASSEMBLY' then coalesce(rate,0) else assembly_payment end,
      operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else operator_payment end,
      disassembly_payment=case when a.assignment_type='DISASSEMBLY' then coalesce(rate,0) else disassembly_payment end,
      automatic_assembly_payment=case when a.assignment_type='ASSEMBLY' then coalesce(rate,0) else automatic_assembly_payment end,
      automatic_operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else automatic_operator_payment end,
      automatic_disassembly_payment=case when a.assignment_type='DISASSEMBLY' then coalesce(rate,0) else automatic_disassembly_payment end,
      updated_by=p_actor where id=payment_id;
  end if;

  if exists (
    select 1 from public.event_staff_payments p where p.id=payment_id and (
      p.status='PAID' or p.settlement_status in ('PAID','FINALIZED','ADVANCE') or coalesce(p.paid_amount,0)>0
      or p.override_at is not null or p.override_operator_payment is not null
      or p.override_assembly_payment is not null or p.override_disassembly_payment is not null
    )
  ) then return payment_id; end if;

  insert into public.event_staff_block_costs(project_id,block_id,staff_id,settlement_id,role,amount,duration_minutes,status,updated_at)
  values(a.project_id,a.block_id,a.staff_id,payment_id,a.assignment_type,rate,minutes,
    case when rate is null then 'REVIEW_REQUIRED' else 'RESOLVED' end,now())
  on conflict(block_id,staff_id,role) do update set
    settlement_id=excluded.settlement_id, amount=excluded.amount, duration_minutes=excluded.duration_minutes,
    status=excluded.status, updated_at=now();
  return payment_id;
end
$function$;

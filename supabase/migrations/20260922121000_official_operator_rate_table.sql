begin;

-- Founder-confirmed operator cost table. These are internal Staff costs only;
-- customer pricing and quotation values are intentionally untouched.
update public.cost_master_entries as c
set amount=v.amount, enabled=true, approval_reason='Tarifario oficial Founder · Staff Operadores',
    metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object('source','FOUNDER_CANONICAL','durationMinutes',v.hours*60), updated_at=now()
from (values
  (2,14000::numeric),(3,19000::numeric),(4,24000::numeric),(5,27000::numeric),
  (6,32000::numeric),(7,37000::numeric),(8,42000::numeric),(9,47000::numeric),(10,52000::numeric)
) as v(hours,amount)
where c.code='OPERATOR_'||v.hours||'_HOURS' and c.deleted_at is null;

insert into public.cost_master_entries(category,code,label,amount,quantity,unit,enabled,display_order,metadata,approval_reason)
select 'OPERATOR','OPERATOR_'||v.hours||'_HOURS','Operador · '||v.hours||' horas',v.amount,1,'CLP',true,20+v.hours,
       jsonb_build_object('source','FOUNDER_CANONICAL','durationMinutes',v.hours*60),
       'Tarifario oficial Founder · Staff Operadores'
from (values
  (2,14000::numeric),(3,19000::numeric),(4,24000::numeric),(5,27000::numeric),
  (6,32000::numeric),(7,37000::numeric),(8,42000::numeric),(9,47000::numeric),(10,52000::numeric)
) as v(hours,amount)
where not exists (select 1 from public.cost_master_entries c where c.code='OPERATOR_'||v.hours||'_HOURS' and c.deleted_at is null);

-- Keep the legacy half-hour code compatible, but resolve it through interpolation below.
update public.cost_master_entries
set amount=25500, enabled=true, metadata=coalesce(metadata,'{}'::jsonb)||'{"source":"FOUNDER_CANONICAL_INTERPOLATED","durationMinutes":270}'::jsonb,
    approval_reason='Interpolación oficial Founder · 4,5 horas', updated_at=now()
where code='OPERATOR_4_5_HOURS' and deleted_at is null;

create or replace function public.resolve_staff_operator_rate(p_minutes integer)
returns numeric language plpgsql stable security definer set search_path=public as $$
declare lower_hours integer; upper_hours integer; lower_amount numeric; upper_amount numeric;
begin
  if p_minutes is null or p_minutes < 120 or p_minutes > 600 then return null; end if;
  lower_hours:=floor(p_minutes/60.0)::integer; upper_hours:=ceil(p_minutes/60.0)::integer;
  if p_minutes % 60 = 0 then
    select amount into lower_amount from public.cost_master_entries where code='OPERATOR_'||lower_hours||'_HOURS' and enabled and deleted_at is null;
    return lower_amount;
  end if;
  if upper_hours > 10 then return null; end if;
  select amount into lower_amount from public.cost_master_entries where code='OPERATOR_'||lower_hours||'_HOURS' and enabled and deleted_at is null;
  select amount into upper_amount from public.cost_master_entries where code='OPERATOR_'||upper_hours||'_HOURS' and enabled and deleted_at is null;
  if lower_amount is null or upper_amount is null then return null; end if;
  return round(lower_amount + (upper_amount-lower_amount)*((p_minutes-lower_hours*60)::numeric/60),0);
end $$;
revoke all on function public.resolve_staff_operator_rate(integer) from public,anon;
grant execute on function public.resolve_staff_operator_rate(integer) to authenticated,service_role;

create or replace function public.refresh_staff_block_payment(p_assignment_id uuid,p_actor uuid default auth.uid())
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.assignments%rowtype; b public.event_operational_blocks%rowtype; rate numeric(14,2); payment_id uuid; event_code text; minutes integer; rate_code text;
begin
  select * into a from public.assignments where id=p_assignment_id and deleted_at is null and status not in('CANCELLED','REJECTED');
  if a.id is null or a.block_id is null then return null; end if;
  select * into b from public.event_operational_blocks where id=a.block_id and project_id=a.project_id;
  minutes:=round(extract(epoch from (b.end_at-b.start_at))/60)::integer;
  rate_code:=case when minutes%60=0 then 'OPERATOR_'||(minutes/60)::text||'_HOURS' else null end;
  if a.assignment_type='OPERATOR' then rate:=public.resolve_staff_operator_rate(minutes); end if;
  select orbit_event_id into event_code from public.projects where id=a.project_id;
  select id into payment_id from public.event_staff_payments where assignment_id=a.id and deleted_at is null and status<>'CANCELLED' for update;
  if payment_id is null then
    insert into public.event_staff_payments(project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,contracted_minutes,block_id,tasks,destination_province,assembly_payment,operator_payment,disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,created_by,updated_by,status)
    values(a.project_id,a.id,a.staff_id,event_code,greatest(2,ceil(minutes/60.0)::integer),minutes,a.block_id,case when a.assignment_type='OPERATOR' then array['OPERATOR'] else array[a.assignment_type] end,'SANTIAGO',0,case when a.assignment_type='OPERATOR' then coalesce(rate,0) else 0 end,0,0,case when a.assignment_type='OPERATOR' then coalesce(rate,0) else 0 end,0,p_actor,p_actor,'ESTIMATED') returning id into payment_id;
  else
    update public.event_staff_payments set contracted_hours=greatest(2,ceil(minutes/60.0)::integer),contracted_minutes=minutes,block_id=a.block_id,operator_payment=case when override_at is null and a.assignment_type='OPERATOR' then coalesce(rate,0) else operator_payment end,automatic_operator_payment=case when a.assignment_type='OPERATOR' then coalesce(rate,0) else automatic_operator_payment end,updated_by=p_actor where id=payment_id;
  end if;
  insert into public.event_staff_block_costs(project_id,block_id,staff_id,settlement_id,role,amount,duration_minutes,status,updated_at)
  values(a.project_id,a.block_id,a.staff_id,payment_id,a.assignment_type,rate,minutes,case when rate is null then 'REVIEW_REQUIRED' else 'RESOLVED' end,now())
  on conflict(block_id,staff_id,role) do update set settlement_id=excluded.settlement_id,amount=excluded.amount,duration_minutes=excluded.duration_minutes,status=excluded.status,updated_at=now();
  return payment_id;
end $$;

commit;

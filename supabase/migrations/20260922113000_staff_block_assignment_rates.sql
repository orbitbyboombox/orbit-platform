begin;

-- Canonical Founder tariff. Existing rates are intentionally untouched.
insert into public.cost_master_entries
  (category,code,label,amount,quantity,unit,enabled,display_order,metadata,approval_reason)
select 'OPERATOR','OPERATOR_4_5_HOURS','Operador · 4,5 horas',26500,1,'CLP',true,16,'{"durationMinutes":270,"source":"FOUNDER_CANONICAL"}'::jsonb,'Tarifa oficial Founder · operador 4,5 horas'
where not exists (select 1 from public.cost_master_entries where code='OPERATOR_4_5_HOURS' and deleted_at is null);
update public.cost_master_entries
set amount=26500, enabled=true, metadata=coalesce(metadata,'{}'::jsonb)||'{"durationMinutes":270,"source":"FOUNDER_CANONICAL"}'::jsonb, updated_at=now(), approval_reason='Tarifa oficial Founder · operador 4,5 horas'
where code='OPERATOR_4_5_HOURS' and deleted_at is null;

alter table public.event_staff_payments
  add column if not exists contracted_minutes integer;
alter table public.event_staff_block_costs
  add column if not exists duration_minutes integer;

drop index if exists public.assignments_active_responsibility_idx;
create unique index if not exists assignments_active_event_responsibility_idx
  on public.assignments(project_id,staff_id,assignment_type)
  where block_id is null and deleted_at is null and status not in ('CANCELLED','REJECTED');
create unique index if not exists assignments_active_block_responsibility_idx
  on public.assignments(project_id,block_id,staff_id,assignment_type)
  where block_id is not null and deleted_at is null and status not in ('CANCELLED','REJECTED');
create index if not exists assignments_active_staff_block_window_idx
  on public.assignments(staff_id,block_id,project_id)
  where block_id is not null and deleted_at is null and status not in ('CANCELLED','REJECTED');

create or replace function public.guard_event_staff_capacity()
returns trigger language plpgsql security invoker set search_path=public as $$
declare required integer; occupied integer;
begin
  if new.assignment_type not in('OPERATOR','ASSEMBLY','DISASSEMBLY') or new.deleted_at is not null or new.status in('CANCELLED','REJECTED') then return new; end if;
  if new.block_id is not null and not exists(select 1 from public.event_operational_blocks where id=new.block_id and project_id=new.project_id) then
    raise exception 'Bloque operacional no encontrado para este Evento.';
  end if;
  if tg_op='UPDATE' and old.project_id=new.project_id and old.assignment_type=new.assignment_type and old.block_id is not distinct from new.block_id and old.deleted_at is null and old.status not in('CANCELLED','REJECTED') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text||':operational-assignment',0));
  select required_quantity into required from public.event_staff_requirements
  where project_id=new.project_id and role=new.assignment_type and block_id is not distinct from new.block_id;
  select count(*) into occupied from public.assignments
  where project_id=new.project_id and assignment_type=new.assignment_type and block_id is not distinct from new.block_id
    and id<>new.id and deleted_at is null and status not in('CANCELLED','REJECTED');
  if occupied >= coalesce(required,1) then raise exception 'Todos los slots de este rol/bloque están cubiertos. Aumenta la cantidad requerida antes de asignar más Staff.'; end if;
  return new;
end $$;

create or replace function public.save_event_staff_assignment(
  p_payload jsonb,p_request_id uuid,p_assignment_id uuid default null,p_replace_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare incoming public.assignments%rowtype; existing public.assignments%rowtype; replaced public.assignments%rowtype; result uuid; conflicting uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede asignar Staff.'; end if;
  incoming:=jsonb_populate_record(null::public.assignments,p_payload);
  if incoming.project_id is null or incoming.staff_id is null or incoming.assignment_type is null or incoming.assignment_type not in('OPERATOR','ASSEMBLY','DISASSEMBLY') or p_request_id is null then raise exception 'Selecciona Staff, rol y Evento.'; end if;
  if incoming.block_id is not null and not exists(select 1 from public.event_operational_blocks where id=incoming.block_id and project_id=incoming.project_id) then raise exception 'Bloque operacional no encontrado.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(incoming.project_id::text||':operational-assignment',0));
  if not exists(select 1 from public.projects where id=incoming.project_id and deleted_at is null and upper(status) not in('CANCELLED','CANCELED','ARCHIVED','CLOSED','COMPLETED')) then raise exception 'El Evento no está activo para asignar Staff.'; end if;
  if p_assignment_id is null then
    select * into existing from public.assignments where id=p_request_id;
    if existing.id is not null then
      if existing.project_id<>incoming.project_id or existing.staff_id<>incoming.staff_id or existing.assignment_type<>incoming.assignment_type or existing.block_id is distinct from incoming.block_id then raise exception 'La referencia de asignación ya fue utilizada.'; end if;
      return jsonb_build_object('id',existing.id,'replay',true);
    end if;
  end if;
  if incoming.block_id is null then
    if exists(select 1 from public.assignments where project_id=incoming.project_id and staff_id=incoming.staff_id and assignment_type=incoming.assignment_type and block_id is null and deleted_at is null and status not in('CANCELLED','REJECTED') and id<>coalesce(p_assignment_id,p_request_id)) then raise exception 'El colaborador ya ocupa este rol a nivel de Evento.'; end if;
  else
    select a.id into conflicting
    from public.assignments a
    join public.event_operational_blocks existing_block on existing_block.id=a.block_id
    join public.event_operational_blocks incoming_block on incoming_block.id=incoming.block_id
    where a.project_id=incoming.project_id and a.staff_id=incoming.staff_id and a.assignment_type=incoming.assignment_type
      and a.block_id is not null and a.deleted_at is null and a.status not in('CANCELLED','REJECTED') and a.id<>coalesce(p_assignment_id,p_request_id)
      and existing_block.start_at<incoming_block.end_at and incoming_block.start_at<existing_block.end_at limit 1;
    if conflicting is not null then raise exception 'El colaborador ya está asignado a un bloque que se solapa.'; end if;
  end if;
  if p_replace_id is not null then
    if p_assignment_id is not null then raise exception 'No puedes editar y reemplazar simultáneamente.'; end if;
    select * into replaced from public.assignments where id=p_replace_id and project_id=incoming.project_id and deleted_at is null for update;
    if replaced.id is null or replaced.status in('COMPLETED','CANCELLED','REJECTED') then raise exception 'La asignación ya no está disponible para reemplazo.'; end if;
    update public.assignments set status='CANCELLED',deleted_at=now(),reason='Staff reemplazado',updated_by=auth.uid() where id=replaced.id;
  end if;
  if p_assignment_id is not null then
    select * into existing from public.assignments where id=p_assignment_id and project_id=incoming.project_id and deleted_at is null for update;
    if existing.id is null or existing.status in('CANCELLED','REJECTED','COMPLETED') then raise exception 'La asignación ya no está disponible para edición.'; end if;
    update public.assignments set staff_id=incoming.staff_id,assignment_type=incoming.assignment_type,block_id=incoming.block_id,
      arrival_time=incoming.arrival_time,staff_call_at=incoming.staff_call_at,staff_call_source=incoming.staff_call_source,
      start_time=incoming.start_time,finish_time=incoming.finish_time,assigned_vehicle=incoming.assigned_vehicle,
      observations=incoming.observations,reason=incoming.reason,resources=coalesce(existing.resources,'{}')||coalesce(incoming.resources,'{}'),updated_by=auth.uid()
    where id=existing.id returning id into result;
  else
    insert into public.assignments(id,project_id,staff_id,assignment_type,block_id,status,arrival_time,staff_call_at,staff_call_source,start_time,finish_time,assigned_vehicle,observations,resources,reason,created_by,updated_by)
    values(p_request_id,incoming.project_id,incoming.staff_id,incoming.assignment_type,incoming.block_id,'ASSIGNED',incoming.arrival_time,incoming.staff_call_at,incoming.staff_call_source,incoming.start_time,incoming.finish_time,incoming.assigned_vehicle,incoming.observations,coalesce(incoming.resources,'{}'),incoming.reason,auth.uid(),auth.uid()) returning id into result;
  end if;
  return jsonb_build_object('id',result,'replay',false);
end $$;

create or replace function public.refresh_staff_block_payment(p_assignment_id uuid,p_actor uuid default auth.uid())
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.assignments%rowtype; b public.event_operational_blocks%rowtype; rate numeric(14,2); payment_id uuid; event_code text; minutes integer; rate_code text;
begin
  select * into a from public.assignments where id=p_assignment_id and deleted_at is null and status not in('CANCELLED','REJECTED');
  if a.id is null or a.block_id is null then return null; end if;
  select * into b from public.event_operational_blocks where id=a.block_id and project_id=a.project_id;
  minutes:=round(extract(epoch from (b.end_at-b.start_at))/60)::integer;
  rate_code:=case when minutes%60=0 then 'OPERATOR_'||(minutes/60)::text||'_HOURS' when minutes%60=30 then 'OPERATOR_'||(minutes/60)::text||'_5_HOURS' else null end;
  if a.assignment_type='OPERATOR' and rate_code is not null then select amount into rate from public.cost_master_entries where code=rate_code and enabled and deleted_at is null; end if;
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
revoke all on function public.refresh_staff_block_payment(uuid,uuid) from public,anon;
grant execute on function public.refresh_staff_block_payment(uuid,uuid) to authenticated,service_role;

create or replace function public.sync_staff_payment_from_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and (old.block_id is not null or old.staff_id is distinct from new.staff_id or old.project_id is distinct from new.project_id) and (old.block_id is distinct from new.block_id or old.staff_id is distinct from new.staff_id or old.status in('CANCELLED','REJECTED') or new.status in('CANCELLED','REJECTED')) then
    update public.event_staff_block_costs set status='REVIEW_REQUIRED',updated_at=now() where settlement_id in(select id from public.event_staff_payments where assignment_id=old.id);
  end if;
  if coalesce(new.block_id,old.block_id) is not null then
    if new.block_id is not null and new.deleted_at is null and new.status not in('CANCELLED','REJECTED') then perform public.refresh_staff_block_payment(new.id,coalesce(auth.uid(),new.updated_by,old.updated_by)); end if;
  else
    perform public.refresh_staff_event_payment(coalesce(new.project_id,old.project_id),coalesce(new.staff_id,old.staff_id),coalesce(auth.uid(),new.updated_by,old.updated_by));
  end if;
  return coalesce(new,old);
end $$;

commit;

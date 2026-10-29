begin;

-- Staff November repair: additive and effective-date scoped. Customer prices,
-- historical settlements and closed/paid payments are intentionally untouched.
alter table public.event_staff_requirements
  drop constraint if exists event_staff_requirements_role_check;
alter table public.event_staff_requirements
  add constraint event_staff_requirements_role_check
  check (role in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY'));

create or replace function public.staff_rate_effective_20261101(p_role text, p_hours numeric)
returns numeric language plpgsql immutable set search_path=public as $$
begin
  if p_role in ('OPERATOR','SUPERVISOR') then
    if p_hours is null or p_hours < 2 then return null; end if;
    return round(20000 + (p_hours - 2) * 5000, 0);
  elsif p_role in ('ASSEMBLY','DISASSEMBLY') then return 10000;
  elsif p_role='ASSEMBLY_DISASSEMBLY' then return 20000;
  end if;
  return null;
end $$;
revoke all on function public.staff_rate_effective_20261101(text,numeric) from public, anon;
grant execute on function public.staff_rate_effective_20261101(text,numeric) to authenticated, service_role;

create or replace function public.guard_event_staff_capacity()
returns trigger language plpgsql security invoker set search_path=public as $$
declare required integer; occupied integer;
begin
  if new.assignment_type not in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY')
     or new.deleted_at is not null or new.status in ('CANCELLED','REJECTED') then return new; end if;
  if new.block_id is not null and not exists(select 1 from public.event_operational_blocks where id=new.block_id and project_id=new.project_id) then
    raise exception 'Bloque operacional no encontrado para este Evento.';
  end if;
  if tg_op='UPDATE' and old.project_id=new.project_id and old.assignment_type=new.assignment_type
     and old.block_id is not distinct from new.block_id and old.deleted_at is null
     and old.status not in ('CANCELLED','REJECTED') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text||':operational-assignment',0));
  select required_quantity into required from public.event_staff_requirements
    where project_id=new.project_id and role=new.assignment_type and block_id is not distinct from new.block_id;
  select count(*) into occupied from public.assignments
    where project_id=new.project_id and assignment_type=new.assignment_type
      and block_id is not distinct from new.block_id and id<>new.id
      and deleted_at is null and status not in ('CANCELLED','REJECTED');
  if occupied >= coalesce(required,1) then raise exception 'Todos los slots de este rol/bloque están cubiertos.'; end if;
  return new;
end $$;

create or replace function public.staff_assignment_rate_for_event(p_role text, p_minutes integer, p_event_date date)
returns numeric language plpgsql stable security definer set search_path=public as $$
declare rate numeric; rate_code text;
begin
  if p_event_date >= date '2026-11-01' then
    return public.staff_rate_effective_20261101(p_role, p_minutes / 60.0);
  end if;
  if p_role in ('OPERATOR','SUPERVISOR') then
    rate_code:=case when p_minutes % 60=0 then 'OPERATOR_'||(p_minutes/60)||'_HOURS'
               when p_minutes % 60=30 then 'OPERATOR_'||(p_minutes/60)||'_5_HOURS' end;
  elsif p_role='ASSEMBLY' then rate_code:='ASSEMBLY';
  elsif p_role='DISASSEMBLY' then rate_code:='DISASSEMBLY';
  end if;
  if rate_code is null then return null; end if;
  select c.amount into rate from public.cost_master_entries c where c.code=rate_code and c.enabled and c.deleted_at is null;
  return rate;
end $$;

create or replace function public.set_event_staff_requirement(
  p_project_id uuid,p_role text,p_required_quantity integer,p_published boolean
) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; occupied integer; event_status text;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede configurar Staff.'; end if;
  if p_role not in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY') or p_required_quantity is null or p_required_quantity<0 then raise exception 'Responsabilidad o cantidad inválida.'; end if;
  select status into event_status from public.projects where id=p_project_id and deleted_at is null;
  if event_status is null then raise exception 'Evento no encontrado.'; end if;
  select count(*) into occupied from public.assignments where project_id=p_project_id and assignment_type=p_role and deleted_at is null and status not in ('CANCELLED','REJECTED');
  if p_required_quantity<occupied then raise exception 'Hay % Staff activos en este rol.',occupied; end if;
  insert into public.event_staff_requirements(project_id,role,required_quantity,published,created_by,updated_by)
  values(p_project_id,p_role,p_required_quantity,p_published,auth.uid(),auth.uid())
  on conflict(project_id,role) do update set required_quantity=excluded.required_quantity,published=excluded.published,updated_at=now(),updated_by=auth.uid()
  returning id into result;
  return result;
end $$;
grant execute on function public.set_event_staff_requirement(uuid,text,integer,boolean) to authenticated;

create or replace function public.save_event_staff_assignment(
  p_payload jsonb,p_request_id uuid,p_assignment_id uuid default null,p_replace_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare incoming public.assignments%rowtype; current_row public.assignments%rowtype; replaced public.assignments%rowtype; result uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede asignar Staff.'; end if;
  incoming:=jsonb_populate_record(null::public.assignments,p_payload);
  if incoming.project_id is null or incoming.staff_id is null or p_request_id is null or incoming.assignment_type not in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY') then raise exception 'Selecciona Staff, rol y Evento.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(incoming.project_id::text||':operational-assignment',0));
  if not exists(select 1 from public.projects where id=incoming.project_id and deleted_at is null and upper(status) not in ('CANCELLED','CANCELED','ARCHIVED','CLOSED','COMPLETED')) then raise exception 'El Evento no está activo para asignar Staff.'; end if;
  if p_assignment_id is null then
    select * into current_row from public.assignments where id=p_request_id;
    if current_row.id is not null then
      if current_row.project_id<>incoming.project_id or current_row.staff_id<>incoming.staff_id or current_row.assignment_type<>incoming.assignment_type or current_row.block_id is distinct from incoming.block_id then raise exception 'La referencia de asignación ya fue utilizada.'; end if;
      return jsonb_build_object('id',current_row.id,'replay',true);
    end if;
  end if;
  if p_replace_id is not null then
    select * into replaced from public.assignments where id=p_replace_id and project_id=incoming.project_id and deleted_at is null for update;
    if replaced.id is null or replaced.status in ('COMPLETED','CANCELLED','REJECTED') then raise exception 'La asignación ya no está disponible para reemplazo.'; end if;
    update public.assignments set status='CANCELLED',deleted_at=now(),reason='Staff reemplazado',updated_by=auth.uid() where id=replaced.id;
  end if;
  if p_assignment_id is not null then
    select * into current_row from public.assignments where id=p_assignment_id and project_id=incoming.project_id and deleted_at is null for update;
    if current_row.id is null or current_row.status in ('COMPLETED','CANCELLED','REJECTED') then raise exception 'La asignación ya no está disponible para edición.'; end if;
    update public.assignments set staff_id=incoming.staff_id,assignment_type=incoming.assignment_type,block_id=incoming.block_id,arrival_time=incoming.arrival_time,staff_call_at=incoming.staff_call_at,staff_call_source=incoming.staff_call_source,start_time=incoming.start_time,finish_time=incoming.finish_time,assigned_vehicle=incoming.assigned_vehicle,observations=incoming.observations,reason=incoming.reason,resources=coalesce(current_row.resources,'{}')||coalesce(incoming.resources,'{}'),updated_by=auth.uid() where id=current_row.id returning id into result;
  else
    insert into public.assignments(id,project_id,staff_id,assignment_type,block_id,status,arrival_time,staff_call_at,staff_call_source,start_time,finish_time,assigned_vehicle,observations,resources,reason,created_by,updated_by)
    values(p_request_id,incoming.project_id,incoming.staff_id,incoming.assignment_type,incoming.block_id,'ASSIGNED',incoming.arrival_time,incoming.staff_call_at,incoming.staff_call_source,incoming.start_time,incoming.finish_time,incoming.assigned_vehicle,incoming.observations,coalesce(incoming.resources,'{}'),incoming.reason,auth.uid(),auth.uid()) returning id into result;
  end if;
  return jsonb_build_object('id',result,'replay',false);
end $$;
grant execute on function public.save_event_staff_assignment(jsonb,uuid,uuid,uuid) to authenticated;

create or replace function public.request_staff_responsibilities(
  p_staff_id uuid,p_project_id uuid,p_responsibilities text[]
) returns uuid[] language plpgsql security definer set search_path=public as $$
declare role_name text; result uuid[]:='{}'; existing_id uuid; required_count integer; assigned_count integer;
begin
  if p_responsibilities is null or cardinality(p_responsibilities)=0 then raise exception 'Selecciona al menos una responsabilidad.'; end if;
  if exists(select 1 from unnest(p_responsibilities) role_name where role_name not in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY')) then raise exception 'Responsabilidad inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':staff-request',0));
  if not exists(select 1 from public.staff_event_publications where project_id=p_project_id and published) then raise exception 'Este evento ya no está disponible.'; end if;
  if not exists(select 1 from public.staff where id=p_staff_id and status='ACTIVE' and deleted_at is null) then raise exception 'Staff no disponible.'; end if;
  foreach role_name in array p_responsibilities loop
    if not exists(select 1 from public.staff where id=p_staff_id and capabilities @> array[role_name]) then raise exception 'No tienes habilitada esta responsabilidad: %.',role_name; end if;
    select required_quantity into required_count from public.event_staff_requirements where project_id=p_project_id and role=role_name and published;
    if coalesce(required_count,0)=0 then raise exception 'La responsabilidad % no está publicada.',role_name; end if;
    select count(*) into assigned_count from public.assignments where project_id=p_project_id and assignment_type=role_name and deleted_at is null and status not in ('CANCELLED','REJECTED');
    if assigned_count>=required_count and not exists(select 1 from public.assignments where project_id=p_project_id and staff_id=p_staff_id and assignment_type=role_name and deleted_at is null and status not in ('CANCELLED','REJECTED')) then raise exception 'El cupo de % ya está completo.',role_name; end if;
    select id into existing_id from public.staff_assignment_requests where project_id=p_project_id and staff_id=p_staff_id and responsibility=role_name and status='PENDING';
    if existing_id is null then insert into public.staff_assignment_requests(project_id,staff_id,responsibility) values(p_project_id,p_staff_id,role_name) returning id into existing_id; end if;
    result:=result||existing_id;
  end loop;
  return result;
end $$;
revoke all on function public.request_staff_responsibilities(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.request_staff_responsibilities(uuid,uuid,text[]) to service_role;

create or replace function public.refresh_staff_block_payment(p_assignment_id uuid, p_actor uuid default auth.uid())
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.assignments%rowtype; b public.event_operational_blocks%rowtype; payment_id uuid; rate numeric; minutes integer; event_date date; event_code text;
begin
  select * into a from public.assignments where id=p_assignment_id and deleted_at is null and status not in ('CANCELLED','REJECTED');
  if a.id is null or a.block_id is null then return null; end if;
  select * into b from public.event_operational_blocks where id=a.block_id and project_id=a.project_id;
  minutes:=round(extract(epoch from (b.end_at-b.start_at))/60)::integer;
  select p.event_date,p.orbit_event_id into event_date,event_code from public.projects p where p.id=a.project_id;
  rate:=public.staff_assignment_rate_for_event(a.assignment_type,minutes,event_date);
  select id into payment_id from public.event_staff_payments where assignment_id=a.id and deleted_at is null and status<>'CANCELLED' for update;
  if payment_id is null then
    insert into public.event_staff_payments(project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,contracted_minutes,block_id,tasks,destination_province,assembly_payment,operator_payment,disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,created_by,updated_by,status)
    values(a.project_id,a.id,a.staff_id,event_code,greatest(2,ceil(minutes/60.0)::integer),minutes,a.block_id,array[case when a.assignment_type='SUPERVISOR' then 'OPERATOR' else a.assignment_type end],'SANTIAGO',case when a.assignment_type='ASSEMBLY' then coalesce(rate,0) else 0 end,case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else 0 end,case when a.assignment_type='DISASSEMBLY' then coalesce(rate,0) else 0 end,case when a.assignment_type='ASSEMBLY' then coalesce(rate,0) else 0 end,case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else 0 end,case when a.assignment_type='DISASSEMBLY' then coalesce(rate,0) else 0 end,p_actor,p_actor,'ESTIMATED') returning id into payment_id;
  elsif not exists(select 1 from public.event_staff_payments p where p.id=payment_id and (p.status='PAID' or p.settlement_status in ('PAID','FINALIZED','ADVANCE') or coalesce(p.paid_amount,0)>0 or p.override_at is not null or p.override_operator_payment is not null or p.override_assembly_payment is not null or p.override_disassembly_payment is not null)) then
    update public.event_staff_payments set contracted_hours=greatest(2,ceil(minutes/60.0)::integer),contracted_minutes=minutes,block_id=a.block_id,
      assembly_payment=case when a.assignment_type='ASSEMBLY' then coalesce(rate,0) else assembly_payment end,
      operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else operator_payment end,
      disassembly_payment=case when a.assignment_type='DISASSEMBLY' then coalesce(rate,0) else disassembly_payment end,
      automatic_assembly_payment=case when a.assignment_type='ASSEMBLY' then coalesce(rate,0) else automatic_assembly_payment end,
      automatic_operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then coalesce(rate,0) else automatic_operator_payment end,
      automatic_disassembly_payment=case when a.assignment_type='DISASSEMBLY' then coalesce(rate,0) else automatic_disassembly_payment end,
      updated_by=p_actor where id=payment_id;
  end if;
  insert into public.event_staff_block_costs(project_id,block_id,staff_id,settlement_id,role,amount,duration_minutes,status,updated_at)
    values(a.project_id,a.block_id,a.staff_id,payment_id,a.assignment_type,rate,minutes,case when rate is null then 'REVIEW_REQUIRED' else 'RESOLVED' end,now())
    on conflict(block_id,staff_id,role) do update set settlement_id=excluded.settlement_id,amount=excluded.amount,duration_minutes=excluded.duration_minutes,status=excluded.status,updated_at=now();
  return payment_id;
end $$;

-- Existing event-level settlement logic is intentionally left in place for
-- legacy assignments; this wrapper only adds Supervisor and the effective
-- November rate while preserving protected payment snapshots.
create or replace function public.refresh_staff_event_payment(p_project_id uuid,p_staff_id uuid,p_actor uuid default auth.uid())
returns uuid language plpgsql security definer set search_path=public as $$
declare a record; p public.event_staff_payments%rowtype; result uuid; rate numeric; hours integer; event_date date; event_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_staff_id::text||':event-settlement',0));
  select max(duration_hours)::integer into hours from public.project_services where project_id=p_project_id;
  select event_date,orbit_event_id into event_date,event_code from public.projects where id=p_project_id;
  if hours is null then raise exception 'El Evento no tiene una duración oficial configurada.'; end if;
  for a in select * from public.assignments where project_id=p_project_id and staff_id=p_staff_id and block_id is null and deleted_at is null and status not in ('CANCELLED','REJECTED') and assignment_type in ('OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY') order by created_at,id loop
    rate:=public.staff_assignment_rate_for_event(a.assignment_type,hours*60,event_date);
    select * into p from public.event_staff_payments where assignment_id=a.id and deleted_at is null and status<>'CANCELLED' order by updated_at desc limit 1 for update;
    if p.id is null then
      insert into public.event_staff_payments(project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,contracted_minutes,tasks,destination_province,assembly_payment,operator_payment,disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,status,settlement_status,paid_amount,created_by,updated_by)
      values(p_project_id,a.id,p_staff_id,event_code,hours,hours*60,array[case when a.assignment_type='SUPERVISOR' then 'OPERATOR' else a.assignment_type end],'SANTIAGO',case when a.assignment_type='ASSEMBLY' then rate else 0 end,case when a.assignment_type in ('OPERATOR','SUPERVISOR') then rate else 0 end,case when a.assignment_type='DISASSEMBLY' then rate else 0 end,case when a.assignment_type='ASSEMBLY' then rate else 0 end,case when a.assignment_type in ('OPERATOR','SUPERVISOR') then rate else 0 end,case when a.assignment_type='DISASSEMBLY' then rate else 0 end,'ESTIMATED','PENDING',0,p_actor,p_actor) returning id into result;
    elsif not (p.status='PAID' or p.settlement_status in ('PAID','FINALIZED','ADVANCE') or coalesce(p.paid_amount,0)>0 or p.override_at is not null or p.override_operator_payment is not null or p.override_assembly_payment is not null or p.override_disassembly_payment is not null) then
      update public.event_staff_payments set contracted_hours=hours,contracted_minutes=hours*60,tasks=array[case when a.assignment_type='SUPERVISOR' then 'OPERATOR' else a.assignment_type end],assembly_payment=case when a.assignment_type='ASSEMBLY' then rate else 0 end,operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then rate else 0 end,disassembly_payment=case when a.assignment_type='DISASSEMBLY' then rate else 0 end,automatic_assembly_payment=case when a.assignment_type='ASSEMBLY' then rate else 0 end,automatic_operator_payment=case when a.assignment_type in ('OPERATOR','SUPERVISOR') then rate else 0 end,automatic_disassembly_payment=case when a.assignment_type='DISASSEMBLY' then rate else 0 end,updated_by=p_actor where id=p.id returning id into result;
    else result:=p.id;
    end if;
  end loop;
  return result;
end $$;

commit;

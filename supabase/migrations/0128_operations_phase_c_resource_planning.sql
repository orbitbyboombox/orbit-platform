begin;

create extension if not exists btree_gist with schema extensions;

-- Canonical, Founder-managed mapping. Product names never become inventory ids.
create table if not exists public.service_asset_type_mappings(
  id uuid primary key default gen_random_uuid(),
  service_code text not null check(length(trim(service_code))>0),
  asset_type text not null check(asset_type in('TOTEM','CASE','CLASSIC_TOTEM','BLACK_STUDIO','BBOX360','LIGHTBOX','BOOMBALL','PRINTER','CAMERA','LIGHT','ACCESSORY')),
  units_per_service numeric(14,3) not null default 1 check(units_per_service>0),
  buffer_before_minutes integer not null default 0 check(buffer_before_minutes>=0),
  buffer_after_minutes integer not null default 0 check(buffer_after_minutes>=0),
  enabled boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique(service_code,asset_type)
);

insert into public.service_asset_type_mappings(service_code,asset_type)
values('CLASSIC','TOTEM'),('BLACK_STUDIO','TOTEM')
on conflict(service_code,asset_type) do nothing;

alter table public.service_asset_type_mappings enable row level security;
create policy service_asset_mapping_internal_read on public.service_asset_type_mappings
  for select using(public.is_internal_user());
create policy service_asset_mapping_admin_write on public.service_asset_type_mappings
  for all using(public.can_administer()) with check(public.can_administer());
grant select,insert,update on public.service_asset_type_mappings to authenticated;
drop trigger if exists service_asset_type_mappings_touch on public.service_asset_type_mappings;
create trigger service_asset_type_mappings_touch before update on public.service_asset_type_mappings
  for each row execute function public.touch_versioned_row();
drop trigger if exists service_asset_type_mappings_audit on public.service_asset_type_mappings;
create trigger service_asset_type_mappings_audit after insert or update or delete on public.service_asset_type_mappings
  for each row execute function public.audit_row_change();

alter table public.event_operational_requirements
  add column if not exists asset_type text,
  add column if not exists mapping_id uuid references public.service_asset_type_mappings(id);

alter table public.asset_assignments
  add column if not exists operational_requirement_id uuid references public.event_operational_requirements(id),
  add column if not exists planned_start_at timestamptz,
  add column if not exists planned_end_at timestamptz,
  add column if not exists released_by uuid references auth.users(id),
  add column if not exists release_reason text,
  add column if not exists replaced_by_assignment_id uuid references public.asset_assignments(id);

alter table public.asset_assignments drop constraint if exists asset_assignments_planned_window_check;
alter table public.asset_assignments add constraint asset_assignments_planned_window_check
  check(planned_start_at is null or planned_end_at is null or planned_end_at>planned_start_at);

-- The legacy index prohibited legitimate non-overlapping reuse. The exclusion
-- constraint is the concurrency boundary for real operational windows.
drop index if exists public.asset_assignments_active_asset_idx;
alter table public.asset_assignments drop constraint if exists asset_assignments_no_overlapping_window;
alter table public.asset_assignments add constraint asset_assignments_no_overlapping_window
  exclude using gist(
    asset_id with =,
    tstzrange(planned_start_at,planned_end_at,'[)') with &&
  ) where(assignment_status='ASSIGNED' and deleted_at is null and planned_start_at is not null and planned_end_at is not null);

create unique index if not exists asset_assignments_active_project_asset_idx
  on public.asset_assignments(project_id,asset_id)
  where assignment_status='ASSIGNED' and deleted_at is null;
create index if not exists asset_assignments_requirement_idx
  on public.asset_assignments(operational_requirement_id,assignment_status)
  where deleted_at is null;

create or replace function public.event_operational_window(p_project_id uuid)
returns table(window_start timestamptz,window_end timestamptz)
language sql stable security definer set search_path=public as $$
  with source as(
    select p.event_date,p.event_time,c.staff_arrival_at,c.assembly_start_at,c.event_start_at,c.service_start_at,
      c.service_end_at,c.disassembly_start_at,c.operational_end_at,
      coalesce((select max(duration_hours) from public.project_services where project_id=p.id),0) duration_hours
    from public.projects p left join public.project_operational_contracts c on c.project_id=p.id
    where p.id=p_project_id and p.deleted_at is null
  ), normalized as(
    select coalesce(assembly_start_at,staff_arrival_at,event_start_at,service_start_at,
      case when event_date is not null and event_time is not null then (event_date+event_time) at time zone 'America/Santiago' end) start_at,
      service_end_at,disassembly_start_at,operational_end_at,duration_hours
    from source
  )
  select start_at,coalesce(operational_end_at,disassembly_start_at,service_end_at,
    case when start_at is not null and duration_hours>0 then start_at+make_interval(mins=>(duration_hours*60)::integer) end)
  from normalized
$$;

create or replace function public.sync_event_operational_requirements(p_project_id uuid,p_actor_id uuid default auth.uid())
returns void language plpgsql security definer set search_path=public as $$
declare q_id uuid; service_row record; quote_row record; requirement_kind text; mapping_row record;
begin
  select id into q_id from public.quotations where project_id=p_project_id and deleted_at is null
    order by case when status='ACCEPTED' then 0 else 1 end,created_at desc limit 1;
  if q_id is not null then
    update public.project_services ps set quantity=(select greatest(qi.quantity,0.001) from public.quotation_items qi
      where qi.quotation_id=q_id and qi.item_type='SERVICE' and qi.code=ps.service_code order by qi.created_at desc limit 1)
    where ps.project_id=p_project_id and exists(select 1 from public.quotation_items qi
      where qi.quotation_id=q_id and qi.item_type='SERVICE' and qi.code=ps.service_code);
  end if;
  update public.event_operational_requirements set status='RETIRED',updated_by=p_actor_id
    where project_id=p_project_id and status='ACTIVE';
  for service_row in select * from public.project_services where project_id=p_project_id loop
    select * into mapping_row from public.service_asset_type_mappings
      where service_code=service_row.service_code and enabled order by created_at limit 1;
    insert into public.event_operational_requirements(project_id,canonical_key,source_type,source_id,code,label,
      requirement_type,asset_type,mapping_id,required_quantity,critical_for_readiness,status,metadata,created_by,updated_by)
    values(p_project_id,'service:'||service_row.id,'PROJECT_SERVICE',service_row.id,service_row.service_code,
      service_row.service_code,'PHYSICAL_UNIT',mapping_row.asset_type,mapping_row.id,
      service_row.quantity*coalesce(mapping_row.units_per_service,1),mapping_row.id is not null,'ACTIVE',
      jsonb_build_object('durationHours',service_row.duration_hours),p_actor_id,p_actor_id)
    on conflict(project_id,canonical_key) do update set code=excluded.code,label=excluded.label,
      required_quantity=excluded.required_quantity,requirement_type=excluded.requirement_type,
      asset_type=excluded.asset_type,mapping_id=excluded.mapping_id,critical_for_readiness=excluded.critical_for_readiness,
      status='ACTIVE',metadata=excluded.metadata,updated_by=excluded.updated_by;
  end loop;
  if q_id is not null then
    for quote_row in select * from public.quotation_items where quotation_id=q_id and item_type<>'SERVICE' loop
      requirement_kind:=case when quote_row.item_type='TRANSPORT' then 'TRANSPORT'
        when upper(quote_row.code) in('UNLIMITED_MAGNETS','MAGNETS','SCRAPBOOK','ADDITIONAL_PRINTING') then 'CONSUMABLE'
        else 'NON_PHYSICAL' end;
      insert into public.event_operational_requirements(project_id,canonical_key,source_type,source_id,code,label,
        requirement_type,required_quantity,critical_for_readiness,status,metadata,created_by,updated_by)
      values(p_project_id,'quote:'||quote_row.id,case when quote_row.item_type='TRANSPORT' then 'TRANSPORT' else 'QUOTATION_ITEM' end,
        quote_row.id,quote_row.code,quote_row.label,requirement_kind,greatest(quote_row.quantity,0.001),false,'ACTIVE',
        jsonb_build_object('commercialItemType',quote_row.item_type),p_actor_id,p_actor_id)
      on conflict(project_id,canonical_key) do update set code=excluded.code,label=excluded.label,
        required_quantity=excluded.required_quantity,requirement_type=excluded.requirement_type,
        asset_type=null,mapping_id=null,critical_for_readiness=false,status='ACTIVE',metadata=excluded.metadata,updated_by=excluded.updated_by;
    end loop;
  end if;
end $$;

create or replace function public.recalculate_event_resource_assignments(p_project_id uuid,p_actor_id uuid default auth.uid())
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.event_operational_requirements requirement set assigned_quantity=(
    select count(*) from public.asset_assignments assignment
    join public.operational_assets asset on asset.id=assignment.asset_id
    where assignment.operational_requirement_id=requirement.id and assignment.assignment_status='ASSIGNED'
      and assignment.deleted_at is null and asset.deleted_at is null
      and asset.asset_type=requirement.asset_type
      and asset.status not in('MAINTENANCE','OUT_OF_SERVICE')),
    updated_by=p_actor_id
  where requirement.project_id=p_project_id and requirement.status='ACTIVE' and requirement.requirement_type='PHYSICAL_UNIT';
end $$;

create or replace function public.refresh_event_operational_readiness(p_project_id uuid,p_actor_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public as $$
declare contract public.project_operational_contracts%rowtype; project_row public.projects%rowtype; resource_row record;
  reasons jsonb:='[]'::jsonb; missing_checklist integer:=0; missing_operator boolean:=false;
  ready boolean; next_status text; days_until integer; missing_assets numeric;
begin
  select * into project_row from public.projects where id=p_project_id and deleted_at is null;
  if not found then raise exception 'Evento no encontrado.'; end if;
  select * into contract from public.project_operational_contracts where project_id=p_project_id for update;
  if not found then raise exception 'Contrato operacional no preparado.'; end if;
  if not exists(select 1 from public.crm_reservations where project_id=p_project_id and status='CONFIRMED') then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','RESERVATION','label','Falta confirmar la Reserva.','href','#commercial')); end if;
  if project_row.event_date is null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','DATE','label','Falta fecha del Evento.','href','#customer')); end if;
  if contract.event_start_at is null or contract.service_start_at is null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','SCHEDULE','label','Falta confirmar el horario operacional mínimo.','href','#operations-readiness')); end if;
  if nullif(trim(coalesce(project_row.location,'')),'') is null or nullif(trim(coalesce(project_row.city,'')),'') is null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','LOCATION','label','Falta confirmar lugar o comuna.','href','#operations-readiness')); end if;
  if contract.contact_status<>'CONFIRMED' or nullif(trim(coalesce(contract.contact_first_name,'')),'') is null or nullif(trim(coalesce(contract.contact_phone,'')),'') is null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','CONTACT','label','Falta confirmar contacto en terreno.','href','#operations-readiness')); end if;
  if not exists(select 1 from public.project_services where project_id=p_project_id and quantity>0) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','SERVICES','label','Faltan servicios y cantidades operacionales.','href','#operations-readiness')); end if;
  for resource_row in select id,label,required_quantity,assigned_quantity from public.event_operational_requirements
    where project_id=p_project_id and status='ACTIVE' and requirement_type='PHYSICAL_UNIT' and asset_type is not null loop
    missing_assets:=greatest(resource_row.required_quantity-resource_row.assigned_quantity,0);
    if missing_assets>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','RESOURCE:'||resource_row.id,
      'label','Falta asignar '||trim(to_char(missing_assets,'FM999999990.###'))||' '||resource_row.label||'.','href','#physical-resource-planning')); end if;
  end loop;
  select count(*) into missing_checklist from public.event_checklist_items item join public.event_checklists checklist on checklist.id=item.checklist_id
    where checklist.project_id=p_project_id and item.mandatory and not item.completed and item.category<>'RETURN';
  if missing_checklist>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','CHECKLIST','label',missing_checklist||' controles críticos continúan pendientes.','href','#operations-checklist')); end if;
  select not exists(select 1 from public.assignments where project_id=p_project_id and assignment_type='OPERATOR' and deleted_at is null
    and status in('ASSIGNED','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED','COMPLETED')) into missing_operator;
  if missing_operator then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','STAFF','label','Falta Staff Operador confirmado.','href','#event-control-center')); end if;
  ready:=jsonb_array_length(reasons)=0;
  next_status:=case when contract.operational_status in('IN_PROGRESS','COMPLETED','CLOSED') then contract.operational_status when ready then 'READY' else 'PREPARATION' end;
  update public.project_operational_contracts set operational_status=next_status,readiness_status=case when ready then 'READY' else 'NOT_READY' end,
    readiness_reasons=reasons,readiness_checked_at=now(),updated_by=p_actor_id where project_id=p_project_id;
  days_until:=project_row.event_date-(timezone('America/Santiago',now())::date);
  if not ready and days_until between 0 and 5 then
    insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,correlation_id,category,priority,
      action_required,entity_type,entity_id,related_href,metadata)
    values(project_row.id,project_row.customer_id,'EVENT_NOT_READY','Evento en '||days_until||' días · operación pendiente',
      jsonb_array_length(reasons)||' requisitos críticos continúan pendientes.','UNREAD','event-readiness:'||project_row.id,'OPERATIONS',
      case when days_until<=1 then 'CRITICAL' else 'HIGH' end,true,'Project',project_row.id,'/projects/'||project_row.id||'#operations-readiness',
      jsonb_build_object('reasons',reasons,'daysUntil',days_until))
    on conflict(correlation_id) do update set title=excluded.title,message=excluded.message,status='UNREAD',priority=excluded.priority,
      action_required=true,metadata=excluded.metadata,read_at=null;
  elsif ready then update public.internal_notifications set status='READ',action_required=false,read_at=coalesce(read_at,now())
    where correlation_id='event-readiness:'||project_row.id and status='UNREAD'; end if;
  return jsonb_build_object('projectId',p_project_id,'operationalStatus',next_status,'readinessStatus',case when ready then 'READY' else 'NOT_READY' end,'reasons',reasons);
end $$;

create or replace function public.assign_operational_assets(p_project_id uuid,p_requirement_id uuid,p_asset_ids uuid[],p_reason text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); requirement record; window_record record; asset_record record; project_record record;
  buffer_before integer:=0; buffer_after integer:=0;
  current_count integer; requested_count integer; assignment_id uuid; assigned_ids uuid[]:='{}';
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede asignar equipos.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'La asignación requiere un motivo.'; end if;
  select * into requirement from public.event_operational_requirements where id=p_requirement_id and project_id=p_project_id
    and status='ACTIVE' and requirement_type='PHYSICAL_UNIT' and asset_type is not null for update;
  if not found then raise exception 'Necesidad física no encontrada.'; end if;
  select * into window_record from public.event_operational_window(p_project_id);
  if window_record.window_start is null or window_record.window_end is null then raise exception 'Confirma la ventana operacional antes de asignar equipos.'; end if;
  select mapping.buffer_before_minutes,mapping.buffer_after_minutes into buffer_before,buffer_after
    from public.service_asset_type_mappings mapping where mapping.id=requirement.mapping_id;
  window_record.window_start:=window_record.window_start-make_interval(mins=>coalesce(buffer_before,0));
  window_record.window_end:=window_record.window_end+make_interval(mins=>coalesce(buffer_after,0));
  select * into project_record from public.projects where id=p_project_id and deleted_at is null;
  select count(*) into requested_count from(select distinct unnest(p_asset_ids) id)s;
  if requested_count=0 then raise exception 'Selecciona al menos un equipo.'; end if;
  select count(*) into current_count from public.asset_assignments where operational_requirement_id=p_requirement_id
    and assignment_status='ASSIGNED' and deleted_at is null;
  if current_count+requested_count>ceil(requirement.required_quantity) then raise exception 'La selección supera la cantidad requerida.'; end if;
  perform 1 from public.operational_assets where id=any(p_asset_ids) order by id for update;
  if (select count(*) from public.operational_assets where id=any(p_asset_ids) and deleted_at is null)<>requested_count then raise exception 'Uno de los equipos no existe.'; end if;
  for asset_record in select * from public.operational_assets where id=any(p_asset_ids) order by asset_code loop
    if asset_record.asset_type<>requirement.asset_type then raise exception '% no corresponde al tipo requerido %.',asset_record.asset_code,requirement.asset_type; end if;
    if asset_record.status in('MAINTENANCE','OUT_OF_SERVICE') then raise exception '% no está operativo.',asset_record.asset_code; end if;
    if exists(select 1 from public.asset_assignments where project_id=p_project_id and asset_id=asset_record.id
      and assignment_status='ASSIGNED' and deleted_at is null) then raise exception '% ya está asignado a este Evento.',asset_record.asset_code; end if;
    if exists(select 1 from public.asset_assignments where asset_id=asset_record.id and assignment_status='ASSIGNED' and deleted_at is null
      and planned_start_at is not null and planned_end_at is not null
      and tstzrange(planned_start_at,planned_end_at,'[)') && tstzrange(window_record.window_start,window_record.window_end,'[)')) then
      raise exception 'CONFLICTO DE DISPONIBILIDAD: % ya está asignado durante la ventana operacional.',asset_record.asset_code;
    end if;
    insert into public.asset_assignments(project_id,asset_id,operational_requirement_id,assignment_status,assigned_by,assigned_at,
      planned_start_at,planned_end_at,reason,created_by,updated_by)
    values(p_project_id,asset_record.id,p_requirement_id,'ASSIGNED',actor,now(),window_record.window_start,window_record.window_end,
      trim(p_reason),actor,actor) returning id into assignment_id;
    assigned_ids:=array_append(assigned_ids,assignment_id);
    update public.operational_assets set status=case when status='AVAILABLE' then 'ASSIGNED' else status end,
      usage_counter=usage_counter+1,updated_by=actor where id=asset_record.id;
    insert into public.asset_history(asset_id,project_id,history_type,message,previous_state,new_state,actor_id,orbit_event_id,correlation_id)
    values(asset_record.id,p_project_id,'OPERATION',asset_record.asset_code||' reservado para ventana operacional.',
      jsonb_build_object('status',asset_record.status),jsonb_build_object('assignmentId',assignment_id,'windowStart',window_record.window_start,
      'windowEnd',window_record.window_end),actor,project_record.orbit_event_id,'resource-assign:'||assignment_id);
  end loop;
  perform public.recalculate_event_resource_assignments(p_project_id,actor);
  perform public.refresh_event_operational_readiness(p_project_id,actor);
  return jsonb_build_object('assignmentIds',assigned_ids,'assigned',requested_count);
exception when exclusion_violation then raise exception 'CONFLICTO DE DISPONIBILIDAD: otro administrador asignó uno de los equipos durante esta operación.';
end $$;

create or replace function public.release_operational_asset(p_assignment_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); item record; project_record record;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede liberar equipos.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'La liberación requiere un motivo.'; end if;
  select assignment.*,asset.asset_code into item from public.asset_assignments assignment
    join public.operational_assets asset on asset.id=assignment.asset_id
    where assignment.id=p_assignment_id and assignment.assignment_status='ASSIGNED' and assignment.deleted_at is null for update of assignment;
  if not found then raise exception 'La asignación ya no está activa.'; end if;
  select * into project_record from public.projects where id=item.project_id;
  update public.asset_assignments set assignment_status='RETURNED',returned_at=now(),released_by=actor,
    release_reason=trim(p_reason),updated_by=actor where id=p_assignment_id;
  update public.operational_assets set status=case when exists(select 1 from public.asset_assignments
      where asset_id=item.asset_id and assignment_status='ASSIGNED' and deleted_at is null) then 'ASSIGNED' else 'AVAILABLE' end,
    updated_by=actor where id=item.asset_id and status not in('MAINTENANCE','OUT_OF_SERVICE');
  insert into public.asset_history(asset_id,project_id,history_type,message,previous_state,new_state,actor_id,orbit_event_id,correlation_id)
  values(item.asset_id,item.project_id,'OPERATION',item.asset_code||' liberado de la planificación.',
    jsonb_build_object('assignmentId',p_assignment_id),jsonb_build_object('status','RETURNED','reason',trim(p_reason)),
    actor,project_record.orbit_event_id,'resource-release:'||p_assignment_id);
  if item.operational_requirement_id is not null then
    perform public.recalculate_event_resource_assignments(item.project_id,actor);
    perform public.refresh_event_operational_readiness(item.project_id,actor);
  end if;
end $$;

create or replace function public.replace_operational_asset(p_assignment_id uuid,p_new_asset_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); old_item record; new_result jsonb; new_assignment_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede reemplazar equipos.'; end if;
  select * into old_item from public.asset_assignments where id=p_assignment_id and assignment_status='ASSIGNED' and deleted_at is null for update;
  if not found or old_item.operational_requirement_id is null then raise exception 'Asignación física no encontrada.'; end if;
  -- Release and assign remain one atomic transaction; any conflict rolls both back.
  perform public.release_operational_asset(p_assignment_id,'Reemplazo: '||trim(p_reason));
  new_result:=public.assign_operational_assets(old_item.project_id,old_item.operational_requirement_id,array[p_new_asset_id],trim(p_reason));
  new_assignment_id:=(new_result->'assignmentIds'->>0)::uuid;
  update public.asset_assignments set replaced_by_assignment_id=new_assignment_id where id=p_assignment_id;
  return jsonb_build_object('releasedAssignmentId',p_assignment_id,'assignmentId',new_assignment_id);
end $$;

create or replace function public.get_event_asset_availability(p_project_id uuid,p_requirement_id uuid)
returns table(asset_id uuid,asset_code text,asset_type text,asset_status text,available boolean,
  conflict_project_id uuid,conflict_project_name text,conflict_start_at timestamptz,conflict_end_at timestamptz)
language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); requirement record; window_record record; buffer_before integer:=0; buffer_after integer:=0;
begin
  if actor is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  select * into requirement from public.event_operational_requirements where id=p_requirement_id and project_id=p_project_id and status='ACTIVE';
  if not found then raise exception 'Necesidad física no encontrada.'; end if;
  select * into window_record from public.event_operational_window(p_project_id);
  select mapping.buffer_before_minutes,mapping.buffer_after_minutes into buffer_before,buffer_after
    from public.service_asset_type_mappings mapping where mapping.id=requirement.mapping_id;
  window_record.window_start:=window_record.window_start-make_interval(mins=>coalesce(buffer_before,0));
  window_record.window_end:=window_record.window_end+make_interval(mins=>coalesce(buffer_after,0));
  return query select asset.id,asset.asset_code,asset.asset_type,asset.status,
    asset.status not in('MAINTENANCE','OUT_OF_SERVICE') and conflict.id is null and own.id is null,
    conflict.project_id,project.name,conflict.planned_start_at,conflict.planned_end_at
  from public.operational_assets asset
  left join lateral(select assignment.* from public.asset_assignments assignment where assignment.asset_id=asset.id
    and assignment.assignment_status='ASSIGNED' and assignment.deleted_at is null and assignment.project_id<>p_project_id
    and assignment.planned_start_at is not null and assignment.planned_end_at is not null
    and window_record.window_start is not null and window_record.window_end is not null
    and tstzrange(assignment.planned_start_at,assignment.planned_end_at,'[)') && tstzrange(window_record.window_start,window_record.window_end,'[)')
    order by assignment.planned_start_at limit 1) conflict on true
  left join public.projects project on project.id=conflict.project_id
  left join lateral(select assignment.id from public.asset_assignments assignment where assignment.asset_id=asset.id
    and assignment.project_id=p_project_id and assignment.assignment_status='ASSIGNED' and assignment.deleted_at is null limit 1) own on true
  where asset.deleted_at is null and asset.asset_type=requirement.asset_type order by asset.asset_code;
end $$;

create or replace function public.asset_assignment_resource_changed()
returns trigger language plpgsql security definer set search_path=public as $$
declare project_value uuid:=coalesce(new.project_id,old.project_id);
begin
  if exists(select 1 from public.project_operational_contracts where project_id=project_value) then
    perform public.recalculate_event_resource_assignments(project_value,auth.uid());
    perform public.refresh_event_operational_readiness(project_value,auth.uid());
  end if;
  return coalesce(new,old);
end $$;
drop trigger if exists asset_assignment_resource_sync on public.asset_assignments;
create trigger asset_assignment_resource_sync after insert or update or delete on public.asset_assignments
  for each row execute function public.asset_assignment_resource_changed();

create or replace function public.asset_health_resource_alert()
returns trigger language plpgsql security definer set search_path=public as $$
declare assignment record;
begin
  if new.status in('MAINTENANCE','OUT_OF_SERVICE') and old.status is distinct from new.status then
    for assignment in select aa.project_id,aa.operational_requirement_id,p.customer_id,p.name,p.event_date
      from public.asset_assignments aa join public.projects p on p.id=aa.project_id
      where aa.asset_id=new.id and aa.assignment_status='ASSIGNED' and aa.deleted_at is null
        and (aa.planned_end_at is null or aa.planned_end_at>now()) loop
      insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,correlation_id,
        category,priority,action_required,entity_type,entity_id,related_href,metadata)
      values(assignment.project_id,assignment.customer_id,'ASSIGNED_ASSET_UNAVAILABLE','Recurso asignado ya no disponible',
        new.asset_code||' cambió a '||new.status||' y requiere reemplazo.','UNREAD',
        'asset-health:'||new.id||':'||assignment.project_id||':'||new.version,'EQUIPMENT','HIGH',true,'OperationalAsset',new.id,
        '/projects/'||assignment.project_id||'#physical-resource-planning',jsonb_build_object('assetCode',new.asset_code,'status',new.status))
      on conflict(correlation_id) do nothing;
      perform public.recalculate_event_resource_assignments(assignment.project_id,new.updated_by);
      perform public.refresh_event_operational_readiness(assignment.project_id,new.updated_by);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists operational_asset_resource_alert on public.operational_assets;
create trigger operational_asset_resource_alert after update of status on public.operational_assets
  for each row execute function public.asset_health_resource_alert();

create or replace function public.service_asset_mapping_changed()
returns trigger language plpgsql security definer set search_path=public as $$
declare event_row record; actor uuid:=coalesce(new.updated_by,new.created_by,auth.uid());
begin
  for event_row in select distinct service.project_id from public.project_services service
    join public.crm_reservations reservation on reservation.project_id=service.project_id and reservation.status='CONFIRMED'
    where service.service_code=new.service_code loop
    perform public.sync_event_operational_requirements(event_row.project_id,actor);
    perform public.recalculate_event_resource_assignments(event_row.project_id,actor);
    perform public.refresh_event_operational_readiness(event_row.project_id,actor);
  end loop;
  return new;
end $$;
drop trigger if exists service_asset_mapping_sync on public.service_asset_type_mappings;
create trigger service_asset_mapping_sync after insert or update on public.service_asset_type_mappings
  for each row execute function public.service_asset_mapping_changed();

revoke all on function public.assign_operational_assets(uuid,uuid,uuid[],text) from public,anon;
revoke all on function public.replace_operational_asset(uuid,uuid,text) from public,anon;
revoke all on function public.release_operational_asset(uuid,text) from public,anon;
revoke all on function public.get_event_asset_availability(uuid,uuid) from public,anon;
grant execute on function public.assign_operational_assets(uuid,uuid,uuid[],text) to authenticated;
grant execute on function public.replace_operational_asset(uuid,uuid,text) to authenticated;
grant execute on function public.release_operational_asset(uuid,text) to authenticated;
grant execute on function public.get_event_asset_availability(uuid,uuid) to authenticated;

-- Deterministic classification backfill only. No physical asset is assigned.
do $$ declare item record;
begin
  for item in select project_id,coalesce(updated_by,created_by) actor_id from public.crm_reservations where status='CONFIRMED' loop
    perform public.sync_event_operational_requirements(item.project_id,item.actor_id);
    perform public.recalculate_event_resource_assignments(item.project_id,item.actor_id);
    perform public.refresh_event_operational_readiness(item.project_id,item.actor_id);
  end loop;
end $$;

commit;

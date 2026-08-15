begin;

-- ORBIT Operations 1.0 A+B. `projects` remains the master Event. This table is
-- a one-to-one operational contract, not a second Event aggregate.
alter table public.project_services
  add column if not exists quantity numeric(14,3);

update public.project_services set quantity=1 where quantity is null;

alter table public.project_services
  alter column quantity set default 1,
  alter column quantity set not null;

alter table public.project_services drop constraint if exists project_services_quantity_check;
alter table public.project_services
  add constraint project_services_quantity_check check(quantity>0);

create table if not exists public.project_operational_contracts(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  operational_status text not null default 'PREPARATION'
    check(operational_status in('PREPARATION','READY','IN_PROGRESS','COMPLETED','CLOSED')),
  contact_status text not null default 'PENDING'
    check(contact_status in('PENDING','CONFIRMED')),
  contact_first_name text,
  contact_last_name text,
  contact_phone text,
  contact_email text,
  contact_role text,
  contact_notes text,
  contact_source text not null default 'PENDING'
    check(contact_source in('PENDING','LEGACY','FOUNDER_CONFIRMED')),
  event_start_at timestamptz,
  service_start_at timestamptz,
  staff_arrival_at timestamptz,
  assembly_start_at timestamptz,
  service_end_at timestamptz,
  disassembly_start_at timestamptz,
  operational_end_at timestamptz,
  access_instructions text,
  operational_notes text,
  special_instructions text,
  equipment_notes text,
  setup_notes text,
  emergency_notes text,
  readiness_status text not null default 'NOT_READY'
    check(readiness_status in('READY','NOT_READY')),
  readiness_reasons jsonb not null default '[]'::jsonb,
  readiness_checked_at timestamptz,
  prepared_at timestamptz not null default now(),
  prepared_by uuid references auth.users(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.event_operational_requirements(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  canonical_key text not null,
  source_type text not null check(source_type in('PROJECT_SERVICE','QUOTATION_ITEM','TRANSPORT')),
  source_id uuid,
  code text not null,
  label text not null,
  requirement_type text not null
    check(requirement_type in('PHYSICAL_UNIT','CONSUMABLE','NON_PHYSICAL','TRANSPORT')),
  required_quantity numeric(14,3) not null check(required_quantity>0),
  assigned_quantity numeric(14,3) not null default 0 check(assigned_quantity>=0),
  critical_for_readiness boolean not null default false,
  status text not null default 'ACTIVE' check(status in('ACTIVE','RETIRED')),
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique(project_id,canonical_key)
);

create index if not exists operational_contract_status_idx
  on public.project_operational_contracts(operational_status,readiness_status);
create index if not exists event_operational_requirements_project_idx
  on public.event_operational_requirements(project_id,status,requirement_type);

alter table public.project_operational_contracts enable row level security;
alter table public.event_operational_requirements enable row level security;

create policy project_operational_contracts_internal_read
  on public.project_operational_contracts for select using(public.is_internal_user());
create policy project_operational_contracts_operations_write
  on public.project_operational_contracts for all
  using(public.current_orbit_role() in('CEO','ADMINISTRATOR','OPERATIONS'))
  with check(public.current_orbit_role() in('CEO','ADMINISTRATOR','OPERATIONS'));
create policy event_operational_requirements_internal_read
  on public.event_operational_requirements for select using(public.is_internal_user());
create policy event_operational_requirements_operations_write
  on public.event_operational_requirements for all
  using(public.current_orbit_role() in('CEO','ADMINISTRATOR','OPERATIONS'))
  with check(public.current_orbit_role() in('CEO','ADMINISTRATOR','OPERATIONS'));

drop trigger if exists project_operational_contracts_touch on public.project_operational_contracts;
create trigger project_operational_contracts_touch before update on public.project_operational_contracts
  for each row execute function public.touch_versioned_row();
drop trigger if exists event_operational_requirements_touch on public.event_operational_requirements;
create trigger event_operational_requirements_touch before update on public.event_operational_requirements
  for each row execute function public.touch_versioned_row();
drop trigger if exists project_operational_contracts_audit on public.project_operational_contracts;
create trigger project_operational_contracts_audit after insert or update or delete on public.project_operational_contracts
  for each row execute function public.audit_row_change();
drop trigger if exists event_operational_requirements_audit on public.event_operational_requirements;
create trigger event_operational_requirements_audit after insert or update or delete on public.event_operational_requirements
  for each row execute function public.audit_row_change();

create or replace function public.sync_event_operational_requirements(p_project_id uuid,p_actor_id uuid default auth.uid())
returns void language plpgsql security definer set search_path=public as $$
declare q_id uuid; service_row record; quote_row record; requirement_kind text;
begin
  select id into q_id from public.quotations
   where project_id=p_project_id and deleted_at is null
   order by case when status='ACCEPTED' then 0 else 1 end,created_at desc limit 1;

  -- A commercial quotation quantity is evidence. Historical rows remain 1 only
  -- when no such evidence exists.
  if q_id is not null then
    update public.project_services ps set quantity=(
      select greatest(qi.quantity,0.001) from public.quotation_items qi
      where qi.quotation_id=q_id and qi.item_type='SERVICE' and qi.code=ps.service_code
      order by qi.created_at desc limit 1)
    where ps.project_id=p_project_id and exists(
      select 1 from public.quotation_items qi
      where qi.quotation_id=q_id and qi.item_type='SERVICE' and qi.code=ps.service_code);
  end if;

  update public.event_operational_requirements set status='RETIRED',updated_by=p_actor_id
   where project_id=p_project_id and status='ACTIVE';

  for service_row in select * from public.project_services where project_id=p_project_id loop
    insert into public.event_operational_requirements(
      project_id,canonical_key,source_type,source_id,code,label,requirement_type,
      required_quantity,critical_for_readiness,status,metadata,created_by,updated_by)
    values(p_project_id,'service:'||service_row.id,'PROJECT_SERVICE',service_row.id,
      service_row.service_code,service_row.service_code,'PHYSICAL_UNIT',service_row.quantity,
      false,'ACTIVE',jsonb_build_object('durationHours',service_row.duration_hours),p_actor_id,p_actor_id)
    on conflict(project_id,canonical_key) do update set
      code=excluded.code,label=excluded.label,required_quantity=excluded.required_quantity,
      requirement_type=excluded.requirement_type,status='ACTIVE',metadata=excluded.metadata,updated_by=excluded.updated_by;
  end loop;

  if q_id is not null then
    for quote_row in select * from public.quotation_items where quotation_id=q_id and item_type<>'SERVICE' loop
      requirement_kind:=case
        when quote_row.item_type='TRANSPORT' then 'TRANSPORT'
        when upper(quote_row.code) in('UNLIMITED_MAGNETS','MAGNETS','SCRAPBOOK','ADDITIONAL_PRINTING') then 'CONSUMABLE'
        else 'NON_PHYSICAL' end;
      insert into public.event_operational_requirements(
        project_id,canonical_key,source_type,source_id,code,label,requirement_type,
        required_quantity,critical_for_readiness,status,metadata,created_by,updated_by)
      values(p_project_id,'quote:'||quote_row.id,case when quote_row.item_type='TRANSPORT' then 'TRANSPORT' else 'QUOTATION_ITEM' end,
        quote_row.id,quote_row.code,quote_row.label,requirement_kind,greatest(quote_row.quantity,0.001),
        false,'ACTIVE',jsonb_build_object('commercialItemType',quote_row.item_type),p_actor_id,p_actor_id)
      on conflict(project_id,canonical_key) do update set
        code=excluded.code,label=excluded.label,required_quantity=excluded.required_quantity,
        requirement_type=excluded.requirement_type,status='ACTIVE',metadata=excluded.metadata,updated_by=excluded.updated_by;
    end loop;
  end if;
end $$;

create or replace function public.refresh_event_operational_readiness(p_project_id uuid,p_actor_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public as $$
declare contract public.project_operational_contracts%rowtype; project_row public.projects%rowtype;
  reasons jsonb:='[]'::jsonb; missing_checklist integer:=0; missing_operator boolean:=false;
  ready boolean; next_status text; days_until integer;
begin
  select * into project_row from public.projects where id=p_project_id and deleted_at is null;
  if not found then raise exception 'Evento no encontrado.'; end if;
  select * into contract from public.project_operational_contracts where project_id=p_project_id for update;
  if not found then raise exception 'Contrato operacional no preparado.'; end if;

  if not exists(select 1 from public.crm_reservations where project_id=p_project_id and status='CONFIRMED') then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','RESERVATION','label','Falta confirmar la Reserva.','href','#commercial'));
  end if;
  if project_row.event_date is null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','DATE','label','Falta fecha del Evento.','href','#customer')); end if;
  if contract.event_start_at is null or contract.service_start_at is null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','SCHEDULE','label','Falta confirmar el horario operacional mínimo.','href','#operations-readiness')); end if;
  if nullif(trim(coalesce(project_row.location,'')),'') is null or nullif(trim(coalesce(project_row.city,'')),'') is null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','LOCATION','label','Falta confirmar lugar o comuna.','href','#operations-readiness')); end if;
  if contract.contact_status<>'CONFIRMED' or nullif(trim(coalesce(contract.contact_first_name,'')),'') is null or nullif(trim(coalesce(contract.contact_phone,'')),'') is null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','CONTACT','label','Falta confirmar contacto en terreno.','href','#operations-readiness')); end if;
  if not exists(select 1 from public.project_services where project_id=p_project_id and quantity>0) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','SERVICES','label','Faltan servicios y cantidades operacionales.','href','#operations-readiness')); end if;

  select count(*) into missing_checklist from public.event_checklist_items item
    join public.event_checklists checklist on checklist.id=item.checklist_id
    where checklist.project_id=p_project_id and item.mandatory and not item.completed and item.category<>'RETURN';
  if missing_checklist>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','CHECKLIST','label',missing_checklist||' controles críticos continúan pendientes.','href','#operations-checklist')); end if;

  select not exists(select 1 from public.assignments where project_id=p_project_id and assignment_type='OPERATOR'
    and deleted_at is null and status in('ASSIGNED','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED','COMPLETED')) into missing_operator;
  if missing_operator then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','STAFF','label','Falta Staff Operador confirmado.','href','#event-control-center')); end if;

  ready:=jsonb_array_length(reasons)=0;
  next_status:=case
    when contract.operational_status in('IN_PROGRESS','COMPLETED','CLOSED') then contract.operational_status
    when ready then 'READY' else 'PREPARATION' end;
  update public.project_operational_contracts set operational_status=next_status,
    readiness_status=case when ready then 'READY' else 'NOT_READY' end,
    readiness_reasons=reasons,readiness_checked_at=now(),updated_by=p_actor_id
    where project_id=p_project_id;

  days_until:=project_row.event_date-(timezone('America/Santiago',now())::date);
  if not ready and days_until between 0 and 5 then
    insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,
      correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
    values(project_row.id,project_row.customer_id,'EVENT_NOT_READY','Evento en '||days_until||' días · operación pendiente',
      jsonb_array_length(reasons)||' requisitos críticos continúan pendientes.','UNREAD','event-readiness:'||project_row.id,
      'OPERATIONS',case when days_until<=1 then 'CRITICAL' else 'HIGH' end,true,'Project',project_row.id,
      '/projects/'||project_row.id||'#operations-readiness',jsonb_build_object('reasons',reasons,'daysUntil',days_until))
    on conflict(correlation_id) do update set title=excluded.title,message=excluded.message,status='UNREAD',
      priority=excluded.priority,action_required=true,metadata=excluded.metadata,read_at=null;
  elsif ready then
    update public.internal_notifications set status='READ',action_required=false,read_at=coalesce(read_at,now())
      where correlation_id='event-readiness:'||project_row.id and status='UNREAD';
  end if;
  return jsonb_build_object('projectId',p_project_id,'operationalStatus',next_status,
    'readinessStatus',case when ready then 'READY' else 'NOT_READY' end,'reasons',reasons);
end $$;

create or replace function public.ensure_event_operational_handoff(p_project_id uuid,p_actor_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype; v_checklist_id uuid; legacy_name text; legacy_phone text;
  duration_minutes integer; event_start timestamptz; result jsonb;
begin
  select * into p from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  if not exists(select 1 from public.crm_reservations where project_id=p_project_id and status='CONFIRMED') then
    raise exception 'La Reserva debe estar confirmada antes del handoff operacional.';
  end if;
  legacy_name:=nullif(trim(coalesce(p.operations->>'operationalContact',p.operations->>'productionContact',p.operations->>'productionName','')),'');
  legacy_phone:=nullif(trim(coalesce(p.operations->>'operationalPhone',p.operations->>'productionPhone',p.operations->>'contactPhone','')),'');
  event_start:=case when p.event_date is not null and p.event_time is not null then (p.event_date+p.event_time) at time zone 'America/Santiago' else null end;
  select (coalesce(max(duration_hours),0)*60)::integer into duration_minutes from public.project_services where project_id=p_project_id;

  insert into public.project_operational_contracts(project_id,contact_status,contact_first_name,contact_phone,contact_source,
    event_start_at,service_start_at,staff_arrival_at,service_end_at,access_instructions,operational_notes,
    special_instructions,equipment_notes,setup_notes,emergency_notes,prepared_by,updated_by)
  values(p.id,case when legacy_name is not null and legacy_phone is not null then 'CONFIRMED' else 'PENDING' end,
    legacy_name,legacy_phone,case when legacy_name is not null or legacy_phone is not null then 'LEGACY' else 'PENDING' end,
    event_start,event_start,case when event_start is null then null else event_start-interval '90 minutes' end,
    case when event_start is null or duration_minutes=0 then null else event_start+make_interval(mins=>duration_minutes) end,
    nullif(p.operations->>'accessInstructions',''),nullif(coalesce(p.operations->>'operationalNotes',p.operations->>'staffNotes'),'') ,
    nullif(p.operations->>'specialInstructions',''),nullif(p.operations->>'equipmentNotes',''),
    nullif(p.operations->>'setupNotes',''),nullif(p.operations->>'emergencyNotes',''),p_actor_id,p_actor_id)
  on conflict(project_id) do update set
    contact_first_name=coalesce(project_operational_contracts.contact_first_name,excluded.contact_first_name),
    contact_phone=coalesce(project_operational_contracts.contact_phone,excluded.contact_phone),
    contact_source=case when project_operational_contracts.contact_source='PENDING' and excluded.contact_source='LEGACY' then 'LEGACY' else project_operational_contracts.contact_source end,
    contact_status=case when project_operational_contracts.contact_status='CONFIRMED' then 'CONFIRMED' else excluded.contact_status end,
    event_start_at=coalesce(project_operational_contracts.event_start_at,excluded.event_start_at),
    service_start_at=coalesce(project_operational_contracts.service_start_at,excluded.service_start_at),
    staff_arrival_at=coalesce(project_operational_contracts.staff_arrival_at,excluded.staff_arrival_at),
    service_end_at=coalesce(project_operational_contracts.service_end_at,excluded.service_end_at),updated_by=p_actor_id;

  perform public.sync_event_operational_requirements(p_project_id,p_actor_id);
  insert into public.event_checklists(project_id,customer_id,orbit_event_id,created_by,updated_by)
    values(p.id,p.customer_id,p.orbit_event_id,p_actor_id,p_actor_id)
    on conflict(project_id) do update set project_id=excluded.project_id returning id into v_checklist_id;
  insert into public.event_checklist_items(checklist_id,item_key,category,label,position)
    select v_checklist_id,v.key,v.category,v.label,v.position from(values
      ('TOTEM_LOADED','EQUIPMENT','Tótem cargado',10),('CASE_LOADED','EQUIPMENT','Case cargado',20),
      ('CAMERA_INSTALLED','EQUIPMENT','Cámara instalada',30),('PRINTER_INSTALLED','EQUIPMENT','Impresora instalada',40),
      ('PAPER_CHECKED','EQUIPMENT','Papel revisado',50),('RIBBON_CHECKED','EQUIPMENT','Ribbon revisado',60),
      ('CABLES','EQUIPMENT','Cables',70),('EXTENSION','EQUIPMENT','Alargador',80),('POWER_STRIP','EQUIPMENT','Regleta eléctrica',90),
      ('TOOL_KIT','EQUIPMENT','Kit de herramientas',100),('TABLET','EQUIPMENT','Tablet',110),('INTERNET','EQUIPMENT','Internet',120),
      ('FUEL_CHECKED','VEHICLE','Combustible revisado',10),('VEHICLE_CLEAN','VEHICLE','Vehículo limpio',20),
      ('DOCUMENTATION_AVAILABLE','VEHICLE','Documentación disponible',30),('ADDRESS_CONFIRMED','EVENT','Dirección confirmada',10),
      ('MAPS_VERIFIED','EVENT','Google Maps verificado',20),('CONTACT_CONFIRMED','EVENT','Contacto confirmado',30),
      ('SCHEDULE_CONFIRMED','EVENT','Horario del evento confirmado',40),('ASSEMBLY_TIME_CONFIRMED','EVENT','Horario de montaje confirmado',50),
      ('DESIGN_APPROVED','CUSTOMER','Diseño aprobado',10),('BRANDING_RECEIVED','CUSTOMER','Branding recibido',20),
      ('QR_CONFIGURED','CUSTOMER','QR configurado',30),('SPECIAL_REQUESTS_REVIEWED','CUSTOMER','Solicitudes especiales revisadas',40),
      ('EQUIPMENT_UNLOADED','RETURN','Equipamiento descargado',10),('DAMAGE_INSPECTION','RETURN','Inspección de daños',20),
      ('CONSUMABLES_COUNTED','RETURN','Consumibles contabilizados',30))v(key,category,label,position)
    on conflict(checklist_id,item_key) do nothing;
  update public.event_checklist_items item set mandatory=case
    when item.category='VEHICLE' then exists(
      select 1 from public.event_operational_requirements requirement
      where requirement.project_id=p_project_id and requirement.requirement_type='TRANSPORT' and requirement.status='ACTIVE')
    when item.item_key='BRANDING_RECEIVED' then exists(
      select 1 from public.event_operational_requirements requirement
      where requirement.project_id=p_project_id and requirement.code='BRANDING' and requirement.status='ACTIVE')
    when item.item_key='QR_CONFIGURED' then exists(
      select 1 from public.event_operational_requirements requirement
      where requirement.project_id=p_project_id and requirement.code='QR' and requirement.status='ACTIVE')
    when item.category='EQUIPMENT' then exists(
      select 1 from public.event_operational_requirements requirement
      where requirement.project_id=p_project_id and requirement.requirement_type='PHYSICAL_UNIT' and requirement.status='ACTIVE')
    else true end
  where item.checklist_id=v_checklist_id;
  result:=public.refresh_event_operational_readiness(p_project_id,p_actor_id);
  return result||jsonb_build_object('checklistId',v_checklist_id);
end $$;

create or replace function public.update_event_operational_contract(p_project_id uuid,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); p public.projects%rowtype; before_row public.project_operational_contracts%rowtype; result jsonb;
begin
  if actor is null or public.current_orbit_role() not in('CEO','ADMINISTRATOR','OPERATIONS') then raise exception 'Permiso operacional requerido.'; end if;
  select * into p from public.projects where id=p_project_id and deleted_at is null;
  select * into before_row from public.project_operational_contracts where project_id=p_project_id for update;
  if not found then raise exception 'Contrato operacional no preparado.'; end if;
  update public.project_operational_contracts set
    contact_first_name=case when p_changes?'contactFirstName' then nullif(trim(p_changes->>'contactFirstName'),'') else contact_first_name end,
    contact_last_name=case when p_changes?'contactLastName' then nullif(trim(p_changes->>'contactLastName'),'') else contact_last_name end,
    contact_phone=case when p_changes?'contactPhone' then nullif(trim(p_changes->>'contactPhone'),'') else contact_phone end,
    contact_email=case when p_changes?'contactEmail' then nullif(trim(p_changes->>'contactEmail'),'') else contact_email end,
    contact_role=case when p_changes?'contactRole' then nullif(trim(p_changes->>'contactRole'),'') else contact_role end,
    contact_notes=case when p_changes?'contactNotes' then nullif(trim(p_changes->>'contactNotes'),'') else contact_notes end,
    contact_status=case when coalesce(nullif(trim(p_changes->>'contactFirstName'),''),contact_first_name) is not null
      and coalesce(nullif(trim(p_changes->>'contactPhone'),''),contact_phone) is not null then 'CONFIRMED' else 'PENDING' end,
    contact_source='FOUNDER_CONFIRMED',
    staff_arrival_at=case when p_changes?'staffArrivalAt' then nullif(p_changes->>'staffArrivalAt','')::timestamptz else staff_arrival_at end,
    assembly_start_at=case when p_changes?'assemblyStartAt' then nullif(p_changes->>'assemblyStartAt','')::timestamptz else assembly_start_at end,
    service_start_at=case when p_changes?'serviceStartAt' then nullif(p_changes->>'serviceStartAt','')::timestamptz else service_start_at end,
    service_end_at=case when p_changes?'serviceEndAt' then nullif(p_changes->>'serviceEndAt','')::timestamptz else service_end_at end,
    disassembly_start_at=case when p_changes?'disassemblyStartAt' then nullif(p_changes->>'disassemblyStartAt','')::timestamptz else disassembly_start_at end,
    operational_end_at=case when p_changes?'operationalEndAt' then nullif(p_changes->>'operationalEndAt','')::timestamptz else operational_end_at end,
    access_instructions=case when p_changes?'accessInstructions' then nullif(trim(p_changes->>'accessInstructions'),'') else access_instructions end,
    operational_notes=case when p_changes?'operationalNotes' then nullif(trim(p_changes->>'operationalNotes'),'') else operational_notes end,
    updated_by=actor where project_id=p_project_id;
  result:=public.refresh_event_operational_readiness(p_project_id,actor);
  insert into public.timeline_events(customer_id,project_id,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,
    event_type,title,description,human_message,correlation_id,created_by)
  values(p.customer_id,p.id,p.orbit_event_id,actor,'Founder','Operations','OPERATIONAL_CONTRACT_UPDATED','ProjectOperationalContract',p.id,
    'OPERATIONAL_CONTRACT_UPDATED','Operación actualizada','Contacto, horarios o instrucciones operacionales fueron actualizados.',
    'Founder actualizó el contrato operacional.','operational-contract:'||p.id||':'||extract(epoch from clock_timestamp())::bigint,actor);
  return result;
end $$;

-- Keep readiness current after explicit operational writes. Reads never call these functions.
create or replace function public.event_readiness_source_changed() returns trigger language plpgsql security definer set search_path=public as $$
declare project_id_value uuid;
begin
  if tg_table_name='event_checklist_items' then
    select project_id into project_id_value from public.event_checklists where id=coalesce(new.checklist_id,old.checklist_id);
  else project_id_value:=coalesce(new.project_id,old.project_id); end if;
  if exists(select 1 from public.project_operational_contracts where project_id=project_id_value) then
    perform public.refresh_event_operational_readiness(project_id_value,auth.uid());
  end if;
  return coalesce(new,old);
end $$;

drop trigger if exists event_readiness_checklist_sync on public.event_checklist_items;
create trigger event_readiness_checklist_sync after update of completed on public.event_checklist_items
  for each row execute function public.event_readiness_source_changed();
drop trigger if exists event_readiness_assignment_sync on public.assignments;
create trigger event_readiness_assignment_sync after insert or update or delete on public.assignments
  for each row execute function public.event_readiness_source_changed();

create or replace function public.operational_milestone_state_sync() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.project_operational_contracts set operational_status=case new.milestone
    when 'EVENT_STARTED' then 'IN_PROGRESS' when 'EVENT_FINISHED' then 'COMPLETED' else operational_status end,
    updated_by=new.recorded_by where project_id=new.project_id;
  return new;
end $$;
drop trigger if exists operational_milestone_state_sync on public.event_operational_milestones;
create trigger operational_milestone_state_sync after insert on public.event_operational_milestones
  for each row execute function public.operational_milestone_state_sync();

-- Available events intentionally exclude customer identity/contact. Confirmed
-- contact remains available only through the assigned-event path.
create or replace view public.staff_available_event_projection with(security_invoker=true) as
select p.id project_id,p.orbit_event_id,p.project_type,p.event_date,p.event_time,p.city,
  coalesce(c.access_instructions,'') access_instructions,
  coalesce(jsonb_agg(jsonb_build_object('code',ps.service_code,'durationHours',ps.duration_hours,'quantity',ps.quantity))
    filter(where ps.id is not null),'[]'::jsonb) services
from public.staff_event_publications publication
join public.projects p on p.id=publication.project_id and p.deleted_at is null
left join public.project_operational_contracts c on c.project_id=p.id
left join public.project_services ps on ps.project_id=p.id
where publication.published
group by p.id,c.access_instructions;

revoke all on public.staff_available_event_projection from public,anon,authenticated;
grant select on public.staff_available_event_projection to service_role;

revoke all on function public.sync_event_operational_requirements(uuid,uuid) from public,anon;
revoke all on function public.refresh_event_operational_readiness(uuid,uuid) from public,anon;
revoke all on function public.ensure_event_operational_handoff(uuid,uuid) from public,anon;
grant execute on function public.sync_event_operational_requirements(uuid,uuid) to authenticated,service_role;
grant execute on function public.refresh_event_operational_readiness(uuid,uuid) to authenticated,service_role;
grant execute on function public.ensure_event_operational_handoff(uuid,uuid) to authenticated,service_role;
revoke all on function public.update_event_operational_contract(uuid,jsonb) from public,anon;
grant execute on function public.update_event_operational_contract(uuid,jsonb) to authenticated;

-- Preserve the certified commercial function and atomically extend its result.
alter function public.prepare_confirmed_reservation_records(uuid,uuid)
  rename to prepare_confirmed_reservation_records_commercial_core;
create function public.prepare_confirmed_reservation_records(p_project_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare commercial_result jsonb; operational_result jsonb;
begin
  commercial_result:=public.prepare_confirmed_reservation_records_commercial_core(p_project_id,p_actor_id);
  operational_result:=public.ensure_event_operational_handoff(p_project_id,p_actor_id);
  return commercial_result||jsonb_build_object('operationalHandoff',operational_result);
end $$;
revoke all on function public.prepare_confirmed_reservation_records(uuid,uuid) from public,anon;
grant execute on function public.prepare_confirmed_reservation_records(uuid,uuid) to authenticated,service_role;

-- Deterministic, non-destructive backfill. Only already-confirmed Reservations.
do $$ declare item record;
begin
  for item in select project_id,coalesce(updated_by,created_by) actor_id from public.crm_reservations
    where status='CONFIRMED' loop
    perform public.ensure_event_operational_handoff(item.project_id,item.actor_id);
  end loop;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.project_operational_contracts,public.event_operational_requirements;
exception when duplicate_object then null; end $$;

commit;

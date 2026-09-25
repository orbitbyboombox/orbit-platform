-- V2.1 Phase A: explicit event-time contract.
-- Existing confirmed-time events remain semantically unchanged.
begin;

alter table public.projects
  add column if not exists event_time_mode text,
  add column if not exists event_time_window text,
  add column if not exists event_time_confirmation_deadline date;

update public.projects
set event_time_mode = case when event_time is null then 'TBD' else 'CONFIRMED' end,
    event_time_window = coalesce(nullif(upper(operations->>'eventTimeWindow'),''),'UNKNOWN'),
    event_time_confirmation_deadline = event_date - 7
where event_time_mode is null;

update public.projects
set event_time_mode = case when event_time is null then 'TBD' else 'CONFIRMED' end
where event_time_mode not in ('CONFIRMED','TBD');

update public.projects
set event_time_window = 'UNKNOWN'
where event_time_window is null or event_time_window not in ('MORNING','AFTERNOON','EVENING','UNKNOWN');

alter table public.projects
  alter column event_time_mode set default 'CONFIRMED',
  alter column event_time_mode set not null,
  alter column event_time_window set default 'UNKNOWN',
  alter column event_time_window set not null;

alter table public.projects drop constraint if exists projects_event_time_mode_check;
alter table public.projects add constraint projects_event_time_mode_check
  check ((event_time_mode='TBD' and event_time is null) or (event_time_mode='CONFIRMED' and event_time is not null));
alter table public.projects drop constraint if exists projects_event_time_window_check;
alter table public.projects add constraint projects_event_time_window_check
  check (event_time_window in ('MORNING','AFTERNOON','EVENING','UNKNOWN'));

create index if not exists projects_pending_event_time_idx
  on public.projects(event_time_confirmation_deadline,event_date)
  where deleted_at is null and event_time_mode='TBD';

create or replace function public.normalize_project_event_time_contract()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.event_time is null then
    new.event_time_mode := 'TBD';
  else
    new.event_time_mode := 'CONFIRMED';
  end if;
  new.event_time_window := coalesce(nullif(upper(new.event_time_window),''), 'UNKNOWN');
  new.event_time_confirmation_deadline := new.event_date - 7;
  return new;
end $$;

drop trigger if exists projects_event_time_contract on public.projects;
create trigger projects_event_time_contract
before insert or update of event_date,event_time,event_time_mode,event_time_window
on public.projects for each row
execute function public.normalize_project_event_time_contract();

-- A TBD event has a date but no operational interval. Keep the existing
-- confirmed-time window semantics intact while returning no window for TBD.
create or replace function public.event_operational_window(p_project_id uuid)
returns table(window_start timestamptz,window_end timestamptz)
language sql stable security definer set search_path=public as $$
  with source as(
    select p.event_date,p.event_time,p.event_time_mode,c.staff_arrival_at,c.assembly_start_at,c.event_start_at,c.service_start_at,
      c.service_end_at,c.disassembly_start_at,c.operational_end_at,
      coalesce((select max(duration_hours) from public.project_services where project_id=p.id),0) duration_hours
    from public.projects p left join public.project_operational_contracts c on c.project_id=p.id
    where p.id=p_project_id and p.deleted_at is null and p.event_time_mode='CONFIRMED'
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

-- Preserve the certified capacity engine and add a fail-closed TBD result.
alter function public.preflight_reservation_capacity(uuid) rename to preflight_reservation_capacity_confirmed;
create or replace function public.preflight_reservation_capacity(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare mode text; event_time_value time;
begin
  select event_time_mode,event_time into mode,event_time_value from public.projects where id=p_project_id and deleted_at is null;
  if mode='TBD' or event_time_value is null then
    return jsonb_build_object('status','CAPACITY_PENDING_TIME','reasonCode','EVENT_TIME_PENDING','humanSafeReason','La disponibilidad se confirmará cuando exista un horario exacto.');
  end if;
  return public.preflight_reservation_capacity_confirmed(p_project_id);
end $$;
revoke all on function public.preflight_reservation_capacity(uuid) from public,anon;
grant execute on function public.preflight_reservation_capacity(uuid) to authenticated,service_role;

alter function public._preflight_draft_capacity_core(text[],text,date,timestamptz,timestamptz,text,text,text)
  rename to _preflight_draft_capacity_confirmed;
create or replace function public._preflight_draft_capacity_core(
  p_service_codes text[], p_event_type text, p_event_date date,
  p_service_start timestamptz, p_service_end timestamptz,
  p_address text default '', p_city text default '', p_shell text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
begin
  if p_event_date is not null and (p_service_start is null or p_service_end is null) then
    return jsonb_build_object('status','CAPACITY_PENDING_TIME','reasonCode','EVENT_TIME_PENDING','humanSafeReason','La disponibilidad se confirmará cuando exista un horario exacto.');
  end if;
  return public._preflight_draft_capacity_confirmed(p_service_codes,p_event_type,p_event_date,p_service_start,p_service_end,p_address,p_city,p_shell);
end $$;

-- The canonical manual pipeline accepts a null event time. The project
-- trigger derives TBD/CONFIRMED from that value without changing the
-- reservation transaction contract.
create or replace function public.create_manual_reservation_atomic(p_draft jsonb)
returns table(customer_id uuid,project_id uuid,orbit_event_id text,customer_created boolean,project_created boolean)
language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid();d_customer jsonb:=p_draft->'client';d_event jsonb:=p_draft->'event';requested_customer_id uuid;c_id uuid;p_id uuid:=gen_random_uuid();crm_id uuid;event_id text;new_customer boolean:=false;service text;stage text:='Customer Lookup';error_state text;error_message text;error_detail text;normalized_rut text:=regexp_replace(upper(coalesce(d_customer->>'rut','')),'[^0-9K]','','g');
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  begin requested_customer_id:=nullif(p_draft->>'crmCustomerId','')::uuid; exception when invalid_text_representation then raise exception 'La referencia CRM del cliente no es válida.'; end;
  if requested_customer_id is not null then
    select c.id into c_id from customers c where c.id=requested_customer_id and c.deleted_at is null for update;
    if c_id is null then raise exception 'El cliente CRM seleccionado ya no está activo.'; end if;
  else
    select c.id into c_id from customers c where c.deleted_at is null and
      ((normalized_rut<>'' and regexp_replace(upper(coalesce(c.rut,'')),'[^0-9K]','','g')=normalized_rut)
      or (nullif(lower(trim(d_customer->>'email')),'') is not null and lower(trim(c.email))=lower(trim(d_customer->>'email')))
      or (nullif(regexp_replace(d_customer->>'phone','[^0-9]','','g'),'') is not null and regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(d_customer->>'phone','[^0-9]','','g'))
      or (nullif(lower(trim(d_customer->>'company')),'') is not null and lower(trim(c.company))=lower(trim(d_customer->>'company')))
      or (nullif(lower(trim(d_customer->>'name')),'') is not null and lower(trim(c.full_name))=lower(trim(d_customer->>'name'))))
      order by case when normalized_rut<>'' and regexp_replace(upper(coalesce(c.rut,'')),'[^0-9K]','','g')=normalized_rut then 0 else 1 end,c.created_at limit 1 for update;
  end if;
  stage:='Customer Create / Reuse';
  if c_id is null then
    c_id:=gen_random_uuid(); new_customer:=true;
    insert into customers(id,full_name,email,secondary_email,phone,company,rut,address,city,metadata,created_by,updated_by)
    values(c_id,d_customer->>'name',nullif(lower(trim(d_customer->>'email')),''),nullif(lower(trim(d_customer->>'secondaryEmail')),''),nullif(d_customer->>'phone',''),nullif(d_customer->>'company',''),nullif(d_customer->>'rut',''),nullif(d_customer->>'address',''),d_event->>'city',jsonb_build_object('leadSource',p_draft->>'origin'),actor,actor);
  end if;
  stage:='Project Create'; event_id:='ORB-'||left(d_event->>'date',4)||'-'||lpad(((abs(hashtext(p_id::text))%999999)+1)::text,6,'0');
  insert into projects(id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,location,city,operations,communication_recipient_snapshot,created_by,updated_by)
  select p_id,c_id,event_id,coalesce(nullif(c.company,''),c.full_name),p_draft->>'type','Upcoming','Healthy',(d_event->>'date')::date,nullif(d_event->>'time','')::time,d_event->>'location',d_event->>'city',
    jsonb_build_object('stage','Primer contacto','commercialStage','New','origin',p_draft->>'origin','notes',coalesce(p_draft->>'notes',''),'score',60,'durationHours',coalesce((d_event->>'durationHours')::numeric,2),'extras',coalesce(d_event->'extras','[]'::jsonb),'reservationMethod','MANUAL','crmCustomerReused',not new_customer,'eventTimeWindow',coalesce(nullif(upper(d_event->>'timeWindow'),''),'UNKNOWN')),
    jsonb_build_object('to',lower(trim(coalesce(c.email,''))),'cc',case when nullif(trim(c.secondary_email),'') is null then '[]'::jsonb else jsonb_build_array(lower(trim(c.secondary_email))) end,'capturedAt',now()),actor,actor from customers c where c.id=c_id;
  stage:='Event Create';
  insert into crm_events(customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by) values(c_id,p_id,event_id,p_draft->>'type',(d_event->>'date')::date,'UPCOMING',actor,actor) returning id into crm_id;
  insert into crm_reservations(customer_id,project_id,event_id,reservation_method,status,created_by,updated_by) values(c_id,p_id,crm_id,'MANUAL','DRAFT',actor,actor);
  for service in select jsonb_array_elements_text(coalesce(p_draft->'services','[]'::jsonb)) loop insert into project_services(project_id,service_code,duration_hours,extras) values(p_id,service,coalesce((d_event->>'durationHours')::numeric,2),coalesce(d_event->'extras','[]'::jsonb)); end loop;
  stage:='Timeline';
  insert into timeline_events(customer_id,project_id,crm_event_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,new_state,created_by)
  values(c_id,p_id,crm_id,event_id,'RESERVATION_CREATED','Nueva reserva manual',case when new_customer then 'Cliente CRM y evento creados.' else 'Cliente CRM existente reutilizado; sólo se creó un nuevo evento.' end,actor,'Administrador','Administrator','RESERVATION_CREATED','Reservation',p_id,case when new_customer then 'Nuevo cliente y evento.' else 'Cliente existente encontrado; nuevo evento creado.' end,'reservation:'||p_id,'DRAFT',actor);
  if new_customer then insert into customer_memory(customer_id,context,created_by,updated_by) values(c_id,jsonb_build_object('customerName',d_customer->>'name','currentTimelineStage','Nuevo','nextRecommendedAction','Realizar primer contacto'),actor,actor); end if;
  return query select c_id,p_id,event_id,new_customer,true;
exception when others then get stacked diagnostics error_state=returned_sqlstate,error_message=message_text,error_detail=pg_exception_detail; raise exception using errcode=error_state,message='RC17F|'||stage||'|'||error_message,detail=error_detail;
end $$;
revoke all on function public.create_manual_reservation_atomic(jsonb) from public,anon;
grant execute on function public.create_manual_reservation_atomic(jsonb) to authenticated;

commit;

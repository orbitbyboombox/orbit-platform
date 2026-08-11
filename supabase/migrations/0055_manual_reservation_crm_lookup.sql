begin;

create or replace function public.create_manual_reservation_atomic(p_draft jsonb)
returns table(customer_id uuid,project_id uuid,orbit_event_id text,customer_created boolean,project_created boolean)
language plpgsql security invoker set search_path=public as $$
declare
  actor uuid:=auth.uid(); d_customer jsonb:=p_draft->'client'; d_event jsonb:=p_draft->'event';
  requested_customer_id uuid; c_id uuid; p_id uuid:=gen_random_uuid(); crm_id uuid; event_id text;
  new_customer boolean:=false; service text;
  normalized_rut text:=regexp_replace(upper(coalesce(d_customer->>'rut','')),'[^0-9K]','','g');
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  begin requested_customer_id:=nullif(p_draft->>'crmCustomerId','')::uuid;
  exception when invalid_text_representation then raise exception 'La referencia CRM del cliente no es válida.'; end;

  if requested_customer_id is not null then
    select c.id into c_id from customers c where c.id=requested_customer_id and c.deleted_at is null for update;
    if c_id is null then raise exception 'El cliente CRM seleccionado ya no está activo.'; end if;
  else
    select c.id into c_id from customers c where c.deleted_at is null and (
      (normalized_rut<>'' and regexp_replace(upper(coalesce(c.rut,'')),'[^0-9K]','','g')=normalized_rut) or
      (nullif(lower(trim(d_customer->>'email')),'') is not null and lower(trim(c.email))=lower(trim(d_customer->>'email'))) or
      (nullif(regexp_replace(d_customer->>'phone','[^0-9]','','g'),'') is not null and regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(d_customer->>'phone','[^0-9]','','g')) or
      (nullif(lower(trim(d_customer->>'company')),'') is not null and lower(trim(c.company))=lower(trim(d_customer->>'company'))) or
      (nullif(lower(trim(d_customer->>'name')),'') is not null and lower(trim(c.full_name))=lower(trim(d_customer->>'name')))
    ) order by case when normalized_rut<>'' and regexp_replace(upper(coalesce(c.rut,'')),'[^0-9K]','','g')=normalized_rut then 0 else 1 end,c.created_at limit 1 for update;
  end if;

  if c_id is null then
    c_id:=gen_random_uuid();new_customer:=true;
    insert into customers(id,full_name,email,phone,company,rut,address,city,metadata,created_by,updated_by)
    values(c_id,d_customer->>'name',nullif(lower(trim(d_customer->>'email')),''),nullif(d_customer->>'phone',''),nullif(d_customer->>'company',''),nullif(d_customer->>'rut',''),nullif(d_customer->>'address',''),d_event->>'city',jsonb_build_object('leadSource',p_draft->>'origin'),actor,actor);
  end if;

  event_id:='ORB-'||left(d_event->>'date',4)||'-'||lpad(((abs(hashtext(p_id::text))%999999)+1)::text,6,'0');
  insert into projects(id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,location,city,operations,created_by,updated_by)
  select p_id,c_id,event_id,coalesce(nullif(c.company,''),c.full_name),p_draft->>'type','Upcoming','Healthy',(d_event->>'date')::date,(d_event->>'time')::time,d_event->>'location',d_event->>'city',jsonb_build_object('stage','Primer contacto','commercialStage','New','origin',p_draft->>'origin','notes',coalesce(p_draft->>'notes',''),'score',60,'durationHours',coalesce((d_event->>'durationHours')::numeric,2),'extras',coalesce(d_event->'extras','[]'::jsonb),'reservationMethod','MANUAL','crmCustomerReused',not new_customer),actor,actor
  from customers c where c.id=c_id;

  insert into crm_events(customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by)
  values(c_id,p_id,event_id,p_draft->>'type',(d_event->>'date')::date,'UPCOMING',actor,actor) returning id into crm_id;
  insert into crm_reservations(customer_id,project_id,event_id,reservation_method,status,created_by,updated_by)
  values(c_id,p_id,crm_id,'MANUAL','DRAFT',actor,actor);
  for service in select jsonb_array_elements_text(coalesce(p_draft->'services','[]'::jsonb)) loop
    insert into project_services(project_id,service_code,duration_hours,extras) values(p_id,service,coalesce((d_event->>'durationHours')::numeric,2),coalesce(d_event->'extras','[]'::jsonb));
  end loop;
  insert into timeline_events(customer_id,project_id,crm_event_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,new_state,created_by)
  values(c_id,p_id,crm_id,event_id,'RESERVATION_CREATED','Nueva reserva manual',case when new_customer then 'Cliente CRM y evento creados.' else 'Cliente CRM existente reutilizado; sólo se creó un nuevo evento.' end,actor,'Administrador','Administrator','RESERVATION_CREATED','Reservation',p_id,case when new_customer then 'Nuevo cliente y evento.' else 'Cliente existente encontrado; nuevo evento creado.' end,'reservation:'||p_id,'DRAFT',actor);
  if new_customer then
    insert into customer_memory(customer_id,context,created_by,updated_by) values(c_id,jsonb_build_object('customerName',d_customer->>'name','currentTimelineStage','Nuevo','nextRecommendedAction','Realizar primer contacto'),actor,actor);
  end if;
  return query select c_id,p_id,event_id,new_customer,true;
end $$;

grant execute on function public.create_manual_reservation_atomic(jsonb) to authenticated;
commit;

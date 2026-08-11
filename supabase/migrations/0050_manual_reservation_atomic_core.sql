create or replace function public.create_manual_reservation_atomic(p_draft jsonb)
returns table(customer_id uuid,project_id uuid,orbit_event_id text,customer_created boolean,project_created boolean)
language plpgsql security invoker set search_path=public as $$
declare
  actor uuid:=auth.uid(); d_customer jsonb:=p_draft->'client'; d_event jsonb:=p_draft->'event';
  c_id uuid; p_id uuid; event_id text; new_customer boolean:=false; new_project boolean:=false; service text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select id into c_id from customers where deleted_at is null and regexp_replace(upper(coalesce(rut,'')),'[^0-9K]','','g')=regexp_replace(upper(coalesce(d_customer->>'rut','')),'[^0-9K]','','g') limit 1;
  if c_id is null then
    c_id:=gen_random_uuid(); new_customer:=true;
    insert into customers(id,full_name,email,phone,company,rut,city,metadata,created_by,updated_by) values(c_id,d_customer->>'name',d_customer->>'email',d_customer->>'phone',nullif(d_customer->>'company',''),nullif(d_customer->>'rut',''),d_event->>'city',jsonb_build_object('address',coalesce(d_customer->>'address','')),actor,actor);
  else
    update customers set full_name=d_customer->>'name',email=d_customer->>'email',phone=d_customer->>'phone',company=nullif(d_customer->>'company',''),city=d_event->>'city',metadata=jsonb_build_object('address',coalesce(d_customer->>'address','')),updated_by=actor where id=c_id;
  end if;
  select id,projects.orbit_event_id into p_id,event_id from projects where projects.customer_id=c_id and event_date=(d_event->>'date')::date and event_time=(d_event->>'time')::time and location=d_event->>'location' and deleted_at is null limit 1;
  if p_id is null then
    p_id:=gen_random_uuid();new_project:=true;event_id:='ORB-'||left(d_event->>'date',4)||'-'||lpad(((abs(hashtext(p_id::text))%999999)+1)::text,6,'0');
    insert into projects(id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,location,city,operations,created_by,updated_by) values(p_id,c_id,event_id,coalesce(nullif(d_customer->>'company',''),d_customer->>'name'),p_draft->>'type','Upcoming','Healthy',(d_event->>'date')::date,(d_event->>'time')::time,d_event->>'location',d_event->>'city',jsonb_build_object('stage','Primer contacto','commercialStage','New','origin',p_draft->>'origin','notes',coalesce(p_draft->>'notes',''),'score',60,'durationHours',coalesce((d_event->>'durationHours')::numeric,2),'extras',coalesce(d_event->'extras','[]'::jsonb),'reservationMethod','MANUAL'),actor,actor);
  end if;
  for service in select jsonb_array_elements_text(coalesce(p_draft->'services','[]'::jsonb)) loop
    insert into project_services(project_id,service_code,duration_hours,extras) values(p_id,service,coalesce((d_event->>'durationHours')::numeric,2),coalesce(d_event->'extras','[]'::jsonb)) on conflict(project_id,service_code) do update set duration_hours=excluded.duration_hours,extras=excluded.extras;
  end loop;
  if new_project then
    insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,new_state,created_by) values(c_id,p_id,event_id,'CUSTOMER_CREATED','Reserva manual iniciada','Customer y Project creados atómicamente.',actor,'Administrador','Administrator','CUSTOMER_CREATED','Customer',c_id,new_customer::text||' · reserva manual creada',gen_random_uuid()::text,'ACTIVE',actor);
  end if;
  if new_customer then insert into customer_memory(customer_id,context,created_by,updated_by) values(c_id,jsonb_build_object('customerName',d_customer->>'name','eventType',p_draft->>'type','eventDate',d_event->>'date','eventLocation',d_event->>'city','currentTimelineStage','Nuevo','nextRecommendedAction','Realizar primer contacto'),actor,actor); end if;
  return query select c_id,p_id,event_id,new_customer,new_project;
end $$;
grant execute on function public.create_manual_reservation_atomic(jsonb) to authenticated;

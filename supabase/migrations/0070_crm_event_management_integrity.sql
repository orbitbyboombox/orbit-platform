begin;

create or replace function public.verify_crm_customer_integrity(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare repaired_events integer:=0; repaired_reservations integer:=0; synchronized_events integer:=0;
begin
  if auth.uid() is null or not public.is_internal_user() then raise exception 'Acceso interno requerido.'; end if;

  insert into crm_events(customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by)
  select p.customer_id,p.id,p.orbit_event_id,p.project_type,p.event_date,
    case when p.deleted_at is not null or upper(p.status) in('CANCELLED','CANCELED') then 'CANCELLED' when upper(p.status)='ARCHIVED' then 'ARCHIVED' else 'ACTIVE' end,
    p.created_by,p.updated_by
  from projects p where p.customer_id=p_customer_id and not exists(select 1 from crm_events e where e.project_id=p.id)
  on conflict(project_id) do nothing;
  get diagnostics repaired_events=row_count;

  update crm_events e set customer_id=p.customer_id,orbit_event_id=p.orbit_event_id,event_type=p.project_type,event_date=p.event_date,
    status=case when p.deleted_at is not null or upper(p.status) in('CANCELLED','CANCELED') then 'CANCELLED' when upper(p.status)='ARCHIVED' then 'ARCHIVED' else 'ACTIVE' end,
    updated_by=auth.uid(),updated_at=now()
  from projects p where e.project_id=p.id and p.customer_id=p_customer_id and
    (e.customer_id,e.orbit_event_id,e.event_type,e.event_date,e.status) is distinct from
    (p.customer_id,p.orbit_event_id,p.project_type,p.event_date,case when p.deleted_at is not null or upper(p.status) in('CANCELLED','CANCELED') then 'CANCELLED' when upper(p.status)='ARCHIVED' then 'ARCHIVED' else 'ACTIVE' end);
  get diagnostics synchronized_events=row_count;

  insert into crm_reservations(customer_id,project_id,event_id,reservation_method,status,created_by,updated_by)
  select p.customer_id,p.id,e.id,coalesce(nullif(upper(p.operations->>'reservationMethod'),''),'MANUAL'),
    case when e.status='CANCELLED' then 'CANCELLED' when e.status='ARCHIVED' then 'ARCHIVED' else 'CONFIRMED' end,p.created_by,p.updated_by
  from projects p join crm_events e on e.project_id=p.id
  where p.customer_id=p_customer_id and not exists(select 1 from crm_reservations r where r.project_id=p.id)
  on conflict(project_id) do nothing;
  get diagnostics repaired_reservations=row_count;

  update crm_reservations r set customer_id=e.customer_id,status=case when e.status='CANCELLED' then 'CANCELLED' when e.status='ARCHIVED' then 'ARCHIVED' else 'CONFIRMED' end,updated_by=auth.uid(),updated_at=now()
  from crm_events e where r.event_id=e.id and e.customer_id=p_customer_id;

  return jsonb_build_object('eventsRepaired',repaired_events,'reservationsRepaired',repaired_reservations,'eventsSynchronized',synchronized_events);
end $$;

create or replace function public.sync_crm_event_from_project() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update crm_events set customer_id=new.customer_id,orbit_event_id=new.orbit_event_id,event_type=new.project_type,event_date=new.event_date,
    status=case when new.deleted_at is not null or upper(new.status) in('CANCELLED','CANCELED') then 'CANCELLED' when upper(new.status)='ARCHIVED' then 'ARCHIVED' else 'ACTIVE' end,
    updated_by=coalesce(auth.uid(),new.updated_by),updated_at=now() where project_id=new.id;
  update crm_reservations set customer_id=new.customer_id,status=case when new.deleted_at is not null or upper(new.status) in('CANCELLED','CANCELED') then 'CANCELLED' when upper(new.status)='ARCHIVED' then 'ARCHIVED' else 'CONFIRMED' end,
    updated_by=coalesce(auth.uid(),new.updated_by),updated_at=now() where project_id=new.id;
  return new;
end $$;
drop trigger if exists projects_sync_crm_event on public.projects;
create trigger projects_sync_crm_event after update of customer_id,orbit_event_id,project_type,event_date,status,deleted_at on public.projects for each row execute function public.sync_crm_event_from_project();

create or replace function public.update_crm_event(p_project_id uuid,p_changes jsonb,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); current_project projects%rowtype; service_id uuid; quotation_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede editar eventos.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo del cambio es obligatorio.'; end if;
  select * into current_project from projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  update projects set event_date=coalesce(nullif(p_changes->>'date','')::date,event_date),event_time=coalesce(nullif(p_changes->>'time','')::time,event_time),
    project_type=coalesce(nullif(p_changes->>'type',''),project_type),location=coalesce(nullif(p_changes->>'location',''),location),city=coalesce(nullif(p_changes->>'municipality',''),city),
    approval_reason=trim(p_reason),updated_by=actor where id=p_project_id;
  select id into service_id from project_services where project_id=p_project_id order by id limit 1;
  if service_id is not null then update project_services set service_code=coalesce(nullif(p_changes->>'service',''),service_code),duration_hours=coalesce(nullif(p_changes->>'duration','')::numeric,duration_hours) where id=service_id; end if;
  select id into quotation_id from quotations where project_id=p_project_id and deleted_at is null order by created_at desc limit 1;
  if quotation_id is not null and nullif(p_changes->>'transport','') is not null then
    update quotations set transport_total=(p_changes->>'transport')::numeric,subtotal=greatest(subtotal-transport_total+(p_changes->>'transport')::numeric,0),grand_total=greatest(grand_total-transport_total+(p_changes->>'transport')::numeric,0),approval_reason=trim(p_reason),updated_by=actor where id=quotation_id;
  end if;
  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(current_project.customer_id,p_project_id,current_project.orbit_event_id,'CRM_EVENT_UPDATED','Evento actualizado desde CRM',trim(p_reason),actor,'Founder','Administrator','CRM_EVENT_UPDATED','Project',p_project_id,'Los datos operacionales y comerciales del evento fueron actualizados desde CRM.','crm-event-update:'||gen_random_uuid(),trim(p_reason),actor);
  perform sync_financial_event(p_project_id);
end $$;

create or replace function public.duplicate_crm_event(p_project_id uuid,p_copy_staff boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); source projects%rowtype; new_project_id uuid:=gen_random_uuid(); new_event_id text; new_crm_event_id uuid; source_quote quotations%rowtype; new_quote_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede duplicar eventos.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo es obligatorio.'; end if;
  select * into source from projects where id=p_project_id and deleted_at is null;
  if not found then raise exception 'Evento no encontrado.'; end if;
  new_event_id:='ORB-'||to_char(coalesce(source.event_date,current_date),'YYYY')||'-'||lpad(((abs(hashtext(new_project_id::text))%999999)+1)::text,6,'0');
  insert into projects(id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,location,city,budget,contract,finance,operations,resources,created_by,updated_by,approval_reason)
  values(new_project_id,source.customer_id,new_event_id,source.name||' · Copia',source.project_type,'Upcoming','ATTENTION',source.event_date,source.event_time,source.location,source.city,source.budget,source.contract,source.finance,source.operations,source.resources,actor,actor,trim(p_reason));
  insert into crm_events(customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by) values(source.customer_id,new_project_id,new_event_id,source.project_type,source.event_date,'ACTIVE',actor,actor) returning id into new_crm_event_id;
  insert into crm_reservations(customer_id,project_id,event_id,reservation_method,status,created_by,updated_by) values(source.customer_id,new_project_id,new_crm_event_id,coalesce(nullif(upper(source.operations->>'reservationMethod'),''),'MANUAL'),'DRAFT',actor,actor);
  insert into project_services(project_id,service_code,duration_hours,extras) select new_project_id,service_code,duration_hours,extras from project_services where project_id=p_project_id;
  select * into source_quote from quotations where project_id=p_project_id and deleted_at is null order by created_at desc limit 1;
  if source_quote.id is not null then
    new_quote_id:=gen_random_uuid();
    insert into quotations(id,quotation_number,customer_id,project_id,orbit_event_id,status,customer_type,event_type,issue_date,expiration_date,currency,subtotal,transport_total,discount_total,tax_total,grand_total,pricing_snapshot,blockers,created_by,updated_by,approval_reason)
    values(new_quote_id,'QT-'||to_char(now(),'YYYYMMDDHH24MISS')||'-'||right(new_project_id::text,4),source.customer_id,new_project_id,new_event_id,'DRAFT',source_quote.customer_type,source.project_type,current_date,current_date+7,source_quote.currency,source_quote.subtotal,source_quote.transport_total,source_quote.discount_total,source_quote.tax_total,source_quote.grand_total,source_quote.pricing_snapshot,source_quote.blockers,actor,actor,trim(p_reason));
    insert into quotation_items(quotation_id,item_type,code,label,quantity,unit_price,total,metadata) select new_quote_id,item_type,code,label,quantity,unit_price,total,metadata from quotation_items where quotation_id=source_quote.id;
  end if;
  if p_copy_staff then insert into assignments(project_id,staff_id,assignment_type,status,resources,created_by,updated_by,reason) select new_project_id,staff_id,assignment_type,'PENDING',resources,actor,actor,trim(p_reason) from assignments where project_id=p_project_id and deleted_at is null; end if;
  insert into timeline_events(customer_id,project_id,crm_event_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,new_state,reason,created_by)
  values(source.customer_id,new_project_id,new_crm_event_id,new_event_id,'CRM_EVENT_DUPLICATED','Evento duplicado desde CRM',trim(p_reason),actor,'Founder','Administrator','CRM_EVENT_DUPLICATED','Project',new_project_id,'Se creó un nuevo evento para el mismo cliente.','crm-event-duplicate:'||new_project_id,'DRAFT',trim(p_reason),actor);
  return new_project_id;
end $$;

revoke all on function public.verify_crm_customer_integrity(uuid) from public,anon;
grant execute on function public.verify_crm_customer_integrity(uuid) to authenticated;
revoke all on function public.update_crm_event(uuid,jsonb,text) from public,anon;
grant execute on function public.update_crm_event(uuid,jsonb,text) to authenticated;
revoke all on function public.duplicate_crm_event(uuid,boolean,text) from public,anon;
grant execute on function public.duplicate_crm_event(uuid,boolean,text) to authenticated;

commit;

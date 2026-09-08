begin;

create or replace function public.authenticate_customer_portal_project(
  p_rut text,
  p_event_date date,
  p_project_id uuid,
  p_ip_hash text,
  p_user_agent text,
  p_device text
)
returns table(session_token text, project_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path=public,extensions as $$
declare normalized text:=upper(regexp_replace(coalesce(p_rut,''),'[^0-9K]','','g')); rut_hash text:=encode(digest(normalized,'sha256'),'hex'); matched record; raw_token text; expiry timestamptz:=now()+interval '8 hours';
begin
  select c.id customer_id,p.id project_id,p.orbit_event_id into matched
  from public.customers c join public.projects p on p.customer_id=c.id
  where p.id=p_project_id and p.event_date=p_event_date
    and upper(regexp_replace(coalesce(c.rut,c.metadata->>'rut',''),'[^0-9K]','','g'))=normalized
    and c.deleted_at is null and p.deleted_at is null and p.status not in('COMPLETED','ARCHIVED');
  insert into public.portal_access_attempts(access_type,normalized_rut_hash,succeeded,customer_id,project_id,ip_hash,user_agent,device)
  values('CUSTOMER',rut_hash,matched.project_id is not null,matched.customer_id,matched.project_id,p_ip_hash,p_user_agent,p_device);
  if matched.project_id is null then return; end if;
  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.portal_access_sessions(access_type,token_hash,customer_id,project_id,ip_hash,user_agent,device,expires_at)
  values('CUSTOMER',encode(digest(raw_token,'sha256'),'hex'),matched.customer_id,matched.project_id,p_ip_hash,p_user_agent,p_device,expiry);
  insert into public.timeline_events(customer_id,project_id,event_type,title,description,orbit_event_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values(matched.customer_id,matched.project_id,'CUSTOMER_PORTAL_ACCESS','Acceso al portal del cliente.','Acceso validado mediante RUT, fecha y evento seleccionado.',matched.orbit_event_id,'Cliente','Customer','CUSTOMER_PORTAL_ACCESS','Project',matched.project_id,'El cliente accedió correctamente a su portal.',gen_random_uuid()::text);
  return query select raw_token,matched.project_id,expiry;
end $$;

revoke all on function public.authenticate_customer_portal_project(text,date,uuid,text,text,text) from public,anon;
grant execute on function public.authenticate_customer_portal_project(text,date,uuid,text,text,text) to service_role;
commit;

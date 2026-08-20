begin;
alter table public.portal_access_attempts add column if not exists failure_code text;
create index if not exists portal_attempts_staff_lock_window_idx on public.portal_access_attempts(normalized_rut_hash,attempted_at desc) where access_type='STAFF' and not succeeded and coalesce(failure_code,'')<>'LOCKED';
create or replace function public.authenticate_staff_portal(p_rut text,p_pin text,p_ip_hash text,p_user_agent text,p_device text)
returns table(session_token text,staff_id uuid,expires_at timestamptz) language plpgsql security definer set search_path=public,extensions as $$
declare normalized text:=upper(regexp_replace(coalesce(p_rut,''),'[^0-9K]','','g'));rut_hash text:=encode(digest(normalized,'sha256'),'hex');member public.staff%rowtype;token text;expiry timestamptz:=now()+interval '12 hours';failed_count integer;result_code text;
begin
  select * into member from public.staff where upper(regexp_replace(coalesce(rut,''),'[^0-9K]','','g'))=normalized order by deleted_at nulls first limit 1;
  select count(*) into failed_count from public.portal_access_attempts where access_type='STAFF' and not succeeded and attempted_at>now()-interval '15 minutes' and coalesce(failure_code,'')<>'LOCKED' and(normalized_rut_hash=rut_hash or ip_hash=p_ip_hash);
  if failed_count>=5 then insert into public.portal_access_attempts(access_type,normalized_rut_hash,succeeded,staff_id,ip_hash,user_agent,device,failure_code)values('STAFF',rut_hash,false,member.id,p_ip_hash,p_user_agent,p_device,'LOCKED');return;end if;
  result_code:=case when member.id is null then 'USER_NOT_FOUND' when member.deleted_at is not null or member.status<>'ACTIVE' then 'STAFF_INACTIVE' when not member.portal_enabled then 'PORTAL_DISABLED' when member.pin_hash is null then 'PIN_NOT_CONFIGURED' when member.pin_hash !~ '^\$2[aby]\$[0-9]{2}\$' then 'HASH_FORMAT_ERROR' when crypt(coalesce(p_pin,''),member.pin_hash)<>member.pin_hash then 'PIN_INVALID' else null end;
  if result_code is not null then insert into public.portal_access_attempts(access_type,normalized_rut_hash,succeeded,staff_id,ip_hash,user_agent,device,failure_code)values('STAFF',rut_hash,false,member.id,p_ip_hash,p_user_agent,p_device,result_code);return;end if;
  insert into public.portal_access_attempts(access_type,normalized_rut_hash,succeeded,staff_id,ip_hash,user_agent,device,failure_code)values('STAFF',rut_hash,true,member.id,p_ip_hash,p_user_agent,p_device,null);
  token:=encode(gen_random_bytes(32),'hex');insert into public.portal_access_sessions(access_type,staff_id,token_hash,expires_at,ip_hash,user_agent,device)values('STAFF',member.id,encode(digest(token,'sha256'),'hex'),expiry,p_ip_hash,p_user_agent,p_device);
  insert into public.timeline_events(staff_id,event_type,title,description,orbit_event_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)values(member.id,'STAFF_PORTAL_ACCESS','Acceso al portal de Staff.','Acceso validado mediante RUT y credencial.','ORB-STAFF-'||member.id,'Staff','Staff','STAFF_PORTAL_ACCESS','Staff',member.id,'El colaborador accedió correctamente a su portal.',gen_random_uuid()::text);
  return query select token,member.id,expiry;
end $$;
revoke all on function public.authenticate_staff_portal(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.authenticate_staff_portal(text,text,text,text,text) to service_role;
commit;

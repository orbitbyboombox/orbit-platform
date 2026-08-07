begin;

alter table public.customers add column if not exists rut text;
update public.customers set rut=metadata->>'rut' where rut is null and nullif(metadata->>'rut','') is not null;
create unique index if not exists customers_rut_unique_idx on public.customers(upper(regexp_replace(rut,'[^0-9K]','','g'))) where rut is not null and deleted_at is null;

alter table public.staff add column if not exists pin_hash text;
alter table public.staff add column if not exists pin_updated_at timestamptz;

create table if not exists public.portal_access_sessions(
  id uuid primary key default gen_random_uuid(), access_type text not null check(access_type in('CUSTOMER','STAFF')),
  token_hash text not null unique, customer_id uuid references public.customers(id), project_id uuid references public.projects(id), staff_id uuid references public.staff(id),
  ip_hash text not null, user_agent text, device text, expires_at timestamptz not null, last_accessed_at timestamptz not null default now(), revoked_at timestamptz,
  created_at timestamptz not null default now(), constraint portal_access_session_subject check(
    (access_type='CUSTOMER' and customer_id is not null and project_id is not null and staff_id is null) or
    (access_type='STAFF' and staff_id is not null and customer_id is null and project_id is null)
  )
);
create index if not exists portal_sessions_token_idx on public.portal_access_sessions(token_hash) where revoked_at is null;

create table if not exists public.portal_access_attempts(
  id bigint generated always as identity primary key, access_type text not null check(access_type in('CUSTOMER','STAFF')),
  normalized_rut_hash text not null, succeeded boolean not null, customer_id uuid references public.customers(id), project_id uuid references public.projects(id), staff_id uuid references public.staff(id),
  ip_hash text not null, user_agent text, device text, attempted_at timestamptz not null default now()
);
create index if not exists portal_attempts_ip_time_idx on public.portal_access_attempts(ip_hash,attempted_at desc);

create or replace function public.set_staff_portal_pin(p_staff_id uuid,p_pin text,p_reason text) returns void
language plpgsql security definer set search_path=public,extensions as $$
begin
  if not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'El PIN debe contener exactamente 4 números.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'La razón del cambio es obligatoria.'; end if;
  update public.staff set pin_hash=crypt(p_pin,gen_salt('bf',10)),pin_updated_at=now(),approval_reason=p_reason,updated_by=auth.uid() where id=p_staff_id and deleted_at is null;
  if not found then raise exception 'Staff no encontrado.'; end if;
end $$;

create or replace function public.authenticate_customer_portal(p_rut text,p_event_date date,p_ip_hash text,p_user_agent text,p_device text)
returns table(session_token text,project_id uuid,expires_at timestamptz) language plpgsql security definer set search_path=public,extensions as $$
declare normalized text:=upper(regexp_replace(coalesce(p_rut,''),'[^0-9K]','','g')); rut_hash text:=encode(digest(normalized,'sha256'),'hex'); matched record; raw_token text; expiry timestamptz:=now()+interval '8 hours';
begin
  select c.id customer_id,p.id project_id,p.orbit_event_id into matched from public.customers c join public.projects p on p.customer_id=c.id
  where upper(regexp_replace(coalesce(c.rut,c.metadata->>'rut',''),'[^0-9K]','','g'))=normalized and p.event_date=p_event_date
    and c.deleted_at is null and p.deleted_at is null and p.status not in('COMPLETED','ARCHIVED') order by p.event_date limit 1;
  insert into public.portal_access_attempts(access_type,normalized_rut_hash,succeeded,customer_id,project_id,ip_hash,user_agent,device)
  values('CUSTOMER',rut_hash,matched.project_id is not null,matched.customer_id,matched.project_id,p_ip_hash,p_user_agent,p_device);
  if matched.project_id is null then return; end if;
  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.portal_access_sessions(access_type,token_hash,customer_id,project_id,ip_hash,user_agent,device,expires_at)
  values('CUSTOMER',encode(digest(raw_token,'sha256'),'hex'),matched.customer_id,matched.project_id,p_ip_hash,p_user_agent,p_device,expiry);
  insert into public.timeline_events(customer_id,project_id,event_type,title,description,orbit_event_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values(matched.customer_id,matched.project_id,'CUSTOMER_PORTAL_ACCESS','Acceso al portal del cliente.','Acceso validado mediante RUT y fecha del evento.',matched.orbit_event_id,'Cliente','Customer','CUSTOMER_PORTAL_ACCESS','Project',matched.project_id,'El cliente accedió correctamente a su portal.',gen_random_uuid()::text);
  return query select raw_token,matched.project_id,expiry;
end $$;

create or replace function public.authenticate_staff_portal(p_rut text,p_pin text,p_ip_hash text,p_user_agent text,p_device text)
returns table(session_token text,staff_id uuid,expires_at timestamptz) language plpgsql security definer set search_path=public,extensions as $$
declare normalized text:=upper(regexp_replace(coalesce(p_rut,''),'[^0-9K]','','g')); rut_hash text:=encode(digest(normalized,'sha256'),'hex'); matched record; raw_token text; expiry timestamptz:=now()+interval '12 hours';
begin
  select s.id,s.pin_hash into matched from public.staff s where upper(regexp_replace(coalesce(s.rut,''),'[^0-9K]','','g'))=normalized and s.status='ACTIVE' and s.deleted_at is null limit 1;
  if matched.id is null or matched.pin_hash is null or crypt(coalesce(p_pin,''),matched.pin_hash)<>matched.pin_hash then matched.id:=null; end if;
  insert into public.portal_access_attempts(access_type,normalized_rut_hash,succeeded,staff_id,ip_hash,user_agent,device) values('STAFF',rut_hash,matched.id is not null,matched.id,p_ip_hash,p_user_agent,p_device);
  if matched.id is null then return; end if;
  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.portal_access_sessions(access_type,token_hash,staff_id,ip_hash,user_agent,device,expires_at) values('STAFF',encode(digest(raw_token,'sha256'),'hex'),matched.id,p_ip_hash,p_user_agent,p_device,expiry);
  insert into public.timeline_events(staff_id,event_type,title,description,orbit_event_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values(matched.id,'STAFF_PORTAL_ACCESS','Acceso al portal de Staff.','Acceso validado mediante RUT y PIN.','ORB-STAFF-'||matched.id,'Staff','Staff','STAFF_PORTAL_ACCESS','Staff',matched.id,'El colaborador accedió correctamente a su portal.',gen_random_uuid()::text);
  return query select raw_token,matched.id,expiry;
end $$;

alter table public.portal_access_sessions enable row level security;
alter table public.portal_access_attempts enable row level security;
create policy portal_sessions_admin_read on public.portal_access_sessions for select using(public.can_administer());
create policy portal_attempts_admin_read on public.portal_access_attempts for select using(public.can_administer());
create trigger portal_access_sessions_audit after insert or update or delete on public.portal_access_sessions for each row execute function public.audit_row_change();
create trigger portal_access_attempts_audit after insert or update or delete on public.portal_access_attempts for each row execute function public.audit_row_change();
revoke all on public.portal_access_sessions,public.portal_access_attempts from anon,authenticated;
revoke all on function public.authenticate_customer_portal(text,date,text,text,text),public.authenticate_staff_portal(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.set_staff_portal_pin(uuid,text,text) to authenticated;

commit;

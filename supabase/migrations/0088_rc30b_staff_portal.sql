begin;

create or replace function public.set_staff_portal_pin(p_staff_id uuid,p_pin text,p_reason text) returns void
language plpgsql security definer set search_path=public,extensions as $$
begin
  if not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  if length(p_pin)<8 then raise exception 'La contraseña debe contener al menos 8 caracteres.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'La razón del cambio es obligatoria.'; end if;
  update public.staff set pin_hash=crypt(p_pin,gen_salt('bf',10)),pin_updated_at=now(),approval_reason=p_reason,updated_by=auth.uid() where id=p_staff_id and deleted_at is null;
  if not found then raise exception 'Staff no encontrado.'; end if;
end $$;

create table if not exists public.staff_event_checkins(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  staff_id uuid not null references public.staff(id),
  status text not null check(status in('ON_THE_WAY','ARRIVED','EVENT_STARTED','EVENT_FINISHED')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  unique(project_id,staff_id,status)
);
create index if not exists staff_event_checkins_staff_time_idx on public.staff_event_checkins(staff_id,occurred_at desc);
alter table public.staff_event_checkins enable row level security;
create policy staff_event_checkins_admin_read on public.staff_event_checkins for select using(public.is_internal_user());
revoke all on public.staff_event_checkins from anon,authenticated;

create or replace function public.record_staff_portal_checkin(p_staff_id uuid,p_project_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;event_code text;customer uuid;label text;preceding text;
begin
  if p_status not in('ON_THE_WAY','ARRIVED','EVENT_STARTED','EVENT_FINISHED') then raise exception 'Estado operacional inválido.'; end if;
  if not exists(select 1 from public.assignments where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null and status not in('CANCELLED','REJECTED')) then raise exception 'El evento no está asignado a este colaborador.'; end if;
  preceding:=case p_status when 'ARRIVED' then 'ON_THE_WAY' when 'EVENT_STARTED' then 'ARRIVED' when 'EVENT_FINISHED' then 'EVENT_STARTED' end;
  if preceding is not null and not exists(select 1 from public.staff_event_checkins where project_id=p_project_id and staff_id=p_staff_id and status=preceding) then raise exception 'Completa primero el estado operacional anterior.'; end if;
  insert into public.staff_event_checkins(project_id,staff_id,status) values(p_project_id,p_staff_id,p_status)
    on conflict(project_id,staff_id,status) do update set occurred_at=staff_event_checkins.occurred_at returning id into result;
  select orbit_event_id,customer_id into event_code,customer from public.projects where id=p_project_id;
  label:=case p_status when 'ON_THE_WAY' then 'En camino' when 'ARRIVED' then 'Llegó al evento' when 'EVENT_STARTED' then 'Evento iniciado' else 'Evento finalizado' end;
  insert into public.timeline_events(customer_id,project_id,staff_id,event_type,title,description,orbit_event_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values(customer,p_project_id,p_staff_id,p_status,label,label,event_code,'Staff','StaffPortal',p_status,'StaffEventCheckin',result,label||' registrado desde Portal Staff.','staff-checkin:'||result)
  on conflict(correlation_id) do nothing;
  insert into public.internal_notifications(project_id,customer_id,staff_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href)
  values(p_project_id,customer,p_staff_id,p_status,label,label||' registrado por el colaborador.','UNREAD','staff-checkin-notification:'||result,'OPERATIONS','INFORMATION',false,'StaffEventCheckin',result::text,'/projects/'||p_project_id)
  on conflict(correlation_id) do nothing;
  return result;
end $$;
revoke all on function public.record_staff_portal_checkin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_staff_portal_checkin(uuid,uuid,text) to service_role;

commit;

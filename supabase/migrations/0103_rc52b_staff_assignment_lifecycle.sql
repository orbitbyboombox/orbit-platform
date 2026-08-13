begin;

create table if not exists public.staff_assignment_cancellations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id),
  project_id uuid not null references public.projects(id),
  staff_id uuid not null references public.staff(id),
  responsibility text not null,
  initiated_by text not null check (initiated_by in ('STAFF','FOUNDER')),
  reason_category text not null check (reason_category in ('ILLNESS','EMERGENCY','FAMILY','VEHICLE','OPERATIONAL','OTHER')),
  reason_detail text,
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz not null default now(),
  email_recipient text,
  email_status text not null default 'PENDING' check (email_status in ('PENDING','SENT','FAILED','NOT_CONFIGURED')),
  email_message_id text,
  email_error text,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assignment_id)
);

create index if not exists staff_assignment_cancellations_project_idx
on public.staff_assignment_cancellations(project_id,cancelled_at desc);
create index if not exists staff_assignment_cancellations_staff_idx
on public.staff_assignment_cancellations(staff_id,cancelled_at desc);

alter table public.staff_assignment_cancellations enable row level security;
create policy staff_assignment_cancellations_admin_read
on public.staff_assignment_cancellations for select
using (public.can_administer());

drop trigger if exists staff_assignment_cancellations_audit on public.staff_assignment_cancellations;
create trigger staff_assignment_cancellations_audit
after insert or update or delete on public.staff_assignment_cancellations
for each row execute function public.audit_row_change();

create or replace function public.cancel_staff_assignment_from_portal(
  p_staff_id uuid,
  p_project_id uuid,
  p_responsibility text,
  p_reason_category text,
  p_reason_detail text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  item public.assignments%rowtype;
  project_record public.projects%rowtype;
  cancellation_id uuid;
  reason_label text;
begin
  if p_reason_category not in ('ILLNESS','EMERGENCY','FAMILY','VEHICLE','OTHER') then
    raise exception 'Selecciona un motivo válido.';
  end if;
  if p_reason_category='OTHER' and nullif(trim(p_reason_detail),'') is null then
    raise exception 'Describe el motivo de la cancelación.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_staff_id::text||':'||p_responsibility,0));
  select * into item from public.assignments
  where project_id=p_project_id and staff_id=p_staff_id and assignment_type=p_responsibility
    and deleted_at is null and status in ('ASSIGNED','PENDING','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED')
  order by created_at desc limit 1 for update;
  if item.id is null then raise exception 'La asignación ya no está disponible para cancelar.'; end if;
  select * into project_record from public.projects where id=p_project_id and deleted_at is null;
  if project_record.id is null then raise exception 'Evento no encontrado.'; end if;
  reason_label:=case p_reason_category when 'ILLNESS' then 'Enfermedad' when 'EMERGENCY' then 'Emergencia' when 'FAMILY' then 'Familiar' when 'VEHICLE' then 'Vehículo' else 'Otro' end;

  update public.assignments set status='CANCELLED',deleted_at=now(),response_at=now(),reason=reason_label||case when nullif(trim(p_reason_detail),'') is not null then ': '||trim(p_reason_detail) else '' end,updated_at=now()
  where id=item.id;
  update public.staff_assignment_requests set status='CANCELLED',reviewed_at=now(),review_reason='Cancelada por Staff: '||reason_label,updated_at=now()
  where project_id=p_project_id and staff_id=p_staff_id and responsibility=p_responsibility and status in ('APPROVED','CONFIRMED');
  insert into public.staff_event_publications(project_id,published,published_at,updated_at)
  values(p_project_id,true,now(),now())
  on conflict(project_id) do update set published=true,published_at=now(),updated_at=now();
  insert into public.staff_assignment_cancellations(assignment_id,project_id,staff_id,responsibility,initiated_by,reason_category,reason_detail)
  values(item.id,p_project_id,p_staff_id,p_responsibility,'STAFF',p_reason_category,nullif(trim(p_reason_detail),'')) returning id into cancellation_id;
  insert into public.timeline_events(customer_id,project_id,staff_id,orbit_event_id,event_type,title,description,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason)
  values(project_record.customer_id,p_project_id,p_staff_id,project_record.orbit_event_id,'STAFF_ASSIGNMENT_CANCELLED','Staff canceló una asignación',reason_label,'Staff','StaffPortal','STAFF_ASSIGNMENT_CANCELLED','StaffAssignmentCancellation',cancellation_id::text,'URGENTE: Staff canceló su asignación. El Evento volvió a requerir cobertura.','staff-assignment-cancelled:'||cancellation_id,coalesce(nullif(trim(p_reason_detail),''),reason_label));
  insert into public.internal_notifications(project_id,customer_id,staff_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
  values(p_project_id,project_record.customer_id,p_staff_id,'STAFF_ASSIGNMENT_CANCELLED','URGENTE · Staff canceló un Evento',reason_label||case when nullif(trim(p_reason_detail),'') is not null then ': '||trim(p_reason_detail) else '' end,'UNREAD','staff-assignment-cancelled-alert:'||cancellation_id,'OPERATIONS','CRITICAL',true,'StaffAssignmentCancellation',cancellation_id::text,'/projects/'||p_project_id,jsonb_build_object('responsibility',p_responsibility,'republished',true));
  return cancellation_id;
end $$;

revoke all on function public.cancel_staff_assignment_from_portal(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.cancel_staff_assignment_from_portal(uuid,uuid,text,text,text) to service_role;

create or replace function public.cancel_staff_assignment_by_founder(
  p_assignment_id uuid,
  p_reason_category text,
  p_reason_detail text
) returns uuid
language plpgsql security invoker set search_path=public as $$
declare
  item public.assignments%rowtype;
  project_record public.projects%rowtype;
  cancellation_id uuid;
  reason_label text;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede cancelar asignaciones.'; end if;
  if p_reason_category not in ('ILLNESS','EMERGENCY','FAMILY','VEHICLE','OPERATIONAL','OTHER') then raise exception 'Selecciona un motivo válido.'; end if;
  if p_reason_category='OTHER' and nullif(trim(p_reason_detail),'') is null then raise exception 'Describe el motivo de la cancelación.'; end if;
  select * into item from public.assignments where id=p_assignment_id and deleted_at is null and status not in ('CANCELLED','REJECTED','COMPLETED') for update;
  if item.id is null then raise exception 'La asignación ya no está disponible para cancelar.'; end if;
  select * into project_record from public.projects where id=item.project_id and deleted_at is null;
  reason_label:=case p_reason_category when 'ILLNESS' then 'Enfermedad' when 'EMERGENCY' then 'Emergencia' when 'FAMILY' then 'Familiar' when 'VEHICLE' then 'Vehículo' when 'OPERATIONAL' then 'Decisión operacional' else 'Otro' end;
  update public.assignments set status='CANCELLED',deleted_at=now(),response_at=now(),reason=reason_label||case when nullif(trim(p_reason_detail),'') is not null then ': '||trim(p_reason_detail) else '' end,updated_by=auth.uid(),updated_at=now() where id=item.id;
  update public.staff_assignment_requests set status='CANCELLED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason='Cancelada por Founder: '||reason_label,updated_at=now()
  where project_id=item.project_id and staff_id=item.staff_id and responsibility=item.assignment_type and status in ('APPROVED','CONFIRMED');
  insert into public.staff_event_publications(project_id,published,published_at,published_by,updated_at)
  values(item.project_id,true,now(),auth.uid(),now())
  on conflict(project_id) do update set published=true,published_at=now(),published_by=auth.uid(),updated_at=now();
  insert into public.staff_assignment_cancellations(assignment_id,project_id,staff_id,responsibility,initiated_by,reason_category,reason_detail,cancelled_by)
  values(item.id,item.project_id,item.staff_id,item.assignment_type,'FOUNDER',p_reason_category,nullif(trim(p_reason_detail),''),auth.uid()) returning id into cancellation_id;
  insert into public.timeline_events(customer_id,project_id,staff_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(project_record.customer_id,item.project_id,item.staff_id,project_record.orbit_event_id,'STAFF_ASSIGNMENT_CANCELLED_BY_FOUNDER','Founder canceló una asignación',reason_label,auth.uid(),'Founder','EventWorkspace','STAFF_ASSIGNMENT_CANCELLED_BY_FOUNDER','StaffAssignmentCancellation',cancellation_id::text,'Founder canceló la asignación y el Evento volvió a requerir cobertura.','founder-assignment-cancelled:'||cancellation_id,coalesce(nullif(trim(p_reason_detail),''),reason_label),auth.uid());
  insert into public.internal_notifications(project_id,customer_id,staff_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
  values(item.project_id,project_record.customer_id,item.staff_id,'STAFF_ASSIGNMENT_CANCELLED_BY_FOUNDER','Asignación cancelada por BOOMBOX',reason_label||case when nullif(trim(p_reason_detail),'') is not null then ': '||trim(p_reason_detail) else '' end,'UNREAD','founder-assignment-cancelled-staff:'||cancellation_id,'STAFF','HIGH',true,'StaffAssignmentCancellation',cancellation_id::text,'/staff-portal',jsonb_build_object('responsibility',item.assignment_type,'republished',true));
  return cancellation_id;
end $$;

grant execute on function public.cancel_staff_assignment_by_founder(uuid,text,text) to authenticated;

commit;

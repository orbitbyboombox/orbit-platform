begin;

alter table public.staff_assignment_cancellations
  add column if not exists settlement_id uuid references public.event_staff_payments(id),
  add column if not exists device text,
  add column if not exists ip_hash text,
  add column if not exists user_agent text,
  add column if not exists republish_allowed boolean not null default false;

drop policy if exists staff_assignment_cancellations_admin_insert on public.staff_assignment_cancellations;
create policy staff_assignment_cancellations_admin_insert
on public.staff_assignment_cancellations for insert to authenticated
with check (
  public.can_administer()
  and initiated_by='FOUNDER'
  and cancelled_by=auth.uid()
);
grant insert on public.staff_assignment_cancellations to authenticated;

create or replace function public.cancel_staff_assignment_canonical(
  p_assignment_id uuid,
  p_staff_id uuid,
  p_project_id uuid,
  p_responsibility text,
  p_initiated_by text,
  p_reason_category text,
  p_reason_detail text,
  p_device text,
  p_ip_hash text,
  p_user_agent text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  item public.assignments%rowtype;
  cancellation_id uuid;
  settlement_id uuid;
  reason_label text;
  may_republish boolean:=false;
  actor uuid:=auth.uid();
begin
  if p_initiated_by not in ('STAFF','FOUNDER') then raise exception 'Origen de cancelación no válido.'; end if;
  if p_initiated_by='FOUNDER' and (actor is null or not public.can_administer()) then raise exception 'Solo Administración puede cancelar asignaciones.'; end if;
  if p_reason_category not in ('ILLNESS','EMERGENCY','FAMILY','VEHICLE','OPERATIONAL','OTHER') then raise exception 'Selecciona un motivo válido.'; end if;
  if p_reason_category='OTHER' and nullif(trim(p_reason_detail),'') is null then raise exception 'Describe el motivo de la cancelación.'; end if;

  if p_assignment_id is not null then
    select * into item from public.assignments
    where id=p_assignment_id and deleted_at is null and status in ('ASSIGNED','PENDING','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED')
    for update;
  else
    perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_staff_id::text||':'||p_responsibility,0));
    select * into item from public.assignments
    where project_id=p_project_id and staff_id=p_staff_id and assignment_type=p_responsibility
      and deleted_at is null and status in ('ASSIGNED','PENDING','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED')
    order by created_at desc limit 1 for update;
  end if;
  if item.id is null then raise exception 'La asignación ya no está disponible para cancelar.'; end if;
  if p_initiated_by='STAFF' and item.staff_id<>p_staff_id then raise exception 'La asignación no pertenece al colaborador.'; end if;
  if not exists(select 1 from public.projects where id=item.project_id and deleted_at is null) then raise exception 'Evento no encontrado.'; end if;

  select id into settlement_id from public.event_staff_payments
  where project_id=item.project_id and staff_id=item.staff_id and deleted_at is null and status<>'CANCELLED'
  order by updated_at desc limit 1 for update;
  select coalesce(published,false) into may_republish from public.staff_event_publications where project_id=item.project_id;

  -- Transaction A: only canonical operational records. All projections run
  -- after this function commits through Boundary B.
  perform set_config('orbit.timeline_boundary','deferred',true);
  reason_label:=case p_reason_category when 'ILLNESS' then 'Enfermedad' when 'EMERGENCY' then 'Emergencia' when 'FAMILY' then 'Familiar' when 'VEHICLE' then 'Vehículo' when 'OPERATIONAL' then 'Decisión operacional' else 'Otro' end;
  update public.assignments set
    status='CANCELLED',deleted_at=now(),response_at=now(),
    reason=reason_label||case when nullif(trim(p_reason_detail),'') is not null then ': '||trim(p_reason_detail) else '' end,
    updated_by=case when p_initiated_by='FOUNDER' then actor else updated_by end,updated_at=now()
  where id=item.id;
  update public.staff_assignment_requests set
    status='CANCELLED',reviewed_at=now(),reviewed_by=case when p_initiated_by='FOUNDER' then actor else reviewed_by end,
    review_reason='Cancelada por '||case when p_initiated_by='FOUNDER' then 'Founder' else 'Staff' end||': '||reason_label,updated_at=now()
  where project_id=item.project_id and staff_id=item.staff_id and responsibility=item.assignment_type and status in ('APPROVED','CONFIRMED');
  insert into public.staff_assignment_cancellations(
    assignment_id,project_id,staff_id,responsibility,initiated_by,reason_category,reason_detail,cancelled_by,
    settlement_id,device,ip_hash,user_agent,republish_allowed
  ) values(
    item.id,item.project_id,item.staff_id,item.assignment_type,p_initiated_by,p_reason_category,nullif(trim(p_reason_detail),''),
    case when p_initiated_by='FOUNDER' then actor else null end,settlement_id,nullif(trim(p_device),''),nullif(trim(p_ip_hash),''),left(nullif(trim(p_user_agent),''),1000),may_republish
  ) returning id into cancellation_id;
  return cancellation_id;
end $$;

revoke all on function public.cancel_staff_assignment_canonical(uuid,uuid,uuid,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.cancel_staff_assignment_canonical(uuid,uuid,uuid,text,text,text,text,text,text,text) to authenticated,service_role;

create or replace function public.cancel_staff_assignment_by_founder(
  p_assignment_id uuid,p_reason_category text,p_reason_detail text,p_device text,p_ip_hash text,p_user_agent text
) returns uuid language sql security invoker set search_path=public as $$
  select public.cancel_staff_assignment_canonical(p_assignment_id,null,null,null,'FOUNDER',p_reason_category,p_reason_detail,p_device,p_ip_hash,p_user_agent);
$$;
grant execute on function public.cancel_staff_assignment_by_founder(uuid,text,text,text,text,text) to authenticated;

create or replace function public.cancel_staff_assignment_from_portal(
  p_staff_id uuid,p_project_id uuid,p_responsibility text,p_reason_category text,p_reason_detail text,p_device text,p_ip_hash text,p_user_agent text
) returns uuid language sql security definer set search_path=public as $$
  select public.cancel_staff_assignment_canonical(null,p_staff_id,p_project_id,p_responsibility,'STAFF',p_reason_category,p_reason_detail,p_device,p_ip_hash,p_user_agent);
$$;
revoke all on function public.cancel_staff_assignment_from_portal(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.cancel_staff_assignment_from_portal(uuid,uuid,text,text,text,text,text,text) to service_role;

commit;

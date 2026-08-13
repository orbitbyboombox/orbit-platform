begin;

-- Documents are private to the Event by default.  Staff may only receive a
-- document after the Founder has explicitly classified it as operational.
alter table public.documents
  add column if not exists operational_for_staff boolean not null default false;

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
  if not exists(select 1 from public.projects where id=p_project_id and deleted_at is null) then
    raise exception 'Evento no encontrado.';
  end if;

  -- Transaction A contains canonical operational records only.  This also
  -- suppresses Timeline writes made indirectly by recalculation triggers.
  perform set_config('orbit.timeline_boundary','deferred',true);
  reason_label:=case p_reason_category when 'ILLNESS' then 'Enfermedad' when 'EMERGENCY' then 'Emergencia' when 'FAMILY' then 'Familiar' when 'VEHICLE' then 'Vehículo' else 'Otro' end;
  update public.assignments set status='CANCELLED',deleted_at=now(),response_at=now(),reason=reason_label||case when nullif(trim(p_reason_detail),'') is not null then ': '||trim(p_reason_detail) else '' end,updated_at=now()
  where id=item.id;
  update public.staff_assignment_requests set status='CANCELLED',reviewed_at=now(),review_reason='Cancelada por Staff: '||reason_label,updated_at=now()
  where project_id=p_project_id and staff_id=p_staff_id and responsibility=p_responsibility and status in ('APPROVED','CONFIRMED');
  insert into public.staff_assignment_cancellations(assignment_id,project_id,staff_id,responsibility,initiated_by,reason_category,reason_detail)
  values(item.id,p_project_id,p_staff_id,p_responsibility,'STAFF',p_reason_category,nullif(trim(p_reason_detail),'')) returning id into cancellation_id;
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
  cancellation_id uuid;
  reason_label text;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede cancelar asignaciones.'; end if;
  if p_reason_category not in ('ILLNESS','EMERGENCY','FAMILY','VEHICLE','OPERATIONAL','OTHER') then raise exception 'Selecciona un motivo válido.'; end if;
  if p_reason_category='OTHER' and nullif(trim(p_reason_detail),'') is null then raise exception 'Describe el motivo de la cancelación.'; end if;
  select * into item from public.assignments where id=p_assignment_id and deleted_at is null and status not in ('CANCELLED','REJECTED','COMPLETED') for update;
  if item.id is null then raise exception 'La asignación ya no está disponible para cancelar.'; end if;
  if not exists(select 1 from public.projects where id=item.project_id and deleted_at is null) then raise exception 'Evento no encontrado.'; end if;

  perform set_config('orbit.timeline_boundary','deferred',true);
  reason_label:=case p_reason_category when 'ILLNESS' then 'Enfermedad' when 'EMERGENCY' then 'Emergencia' when 'FAMILY' then 'Familiar' when 'VEHICLE' then 'Vehículo' when 'OPERATIONAL' then 'Decisión operacional' else 'Otro' end;
  update public.assignments set status='CANCELLED',deleted_at=now(),response_at=now(),reason=reason_label||case when nullif(trim(p_reason_detail),'') is not null then ': '||trim(p_reason_detail) else '' end,updated_by=auth.uid(),updated_at=now() where id=item.id;
  update public.staff_assignment_requests set status='CANCELLED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason='Cancelada por Founder: '||reason_label,updated_at=now()
  where project_id=item.project_id and staff_id=item.staff_id and responsibility=item.assignment_type and status in ('APPROVED','CONFIRMED');
  insert into public.staff_assignment_cancellations(assignment_id,project_id,staff_id,responsibility,initiated_by,reason_category,reason_detail,cancelled_by)
  values(item.id,item.project_id,item.staff_id,item.assignment_type,'FOUNDER',p_reason_category,nullif(trim(p_reason_detail),''),auth.uid()) returning id into cancellation_id;
  return cancellation_id;
end $$;

grant execute on function public.cancel_staff_assignment_by_founder(uuid,text,text) to authenticated;

commit;

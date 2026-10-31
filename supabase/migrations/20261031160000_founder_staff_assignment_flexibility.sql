begin;

-- Founder/Admin assignments are operational corrections, not demand fulfillment.
-- Requirements remain reporting guidance; this removes the artificial capacity
-- rejection while preserving block validity and the existing unique indexes.
create or replace function public.guard_event_staff_capacity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.assignment_type not in ('OPERATOR', 'ASSEMBLY', 'DISASSEMBLY')
     or new.deleted_at is not null
     or new.status in ('CANCELLED', 'REJECTED') then
    return new;
  end if;

  if new.block_id is not null
     and not exists (
       select 1
       from public.event_operational_blocks
       where id = new.block_id
         and project_id = new.project_id
     ) then
    raise exception 'Bloque operacional no encontrado para este Evento.';
  end if;

  return new;
end;
$$;

comment on function public.guard_event_staff_capacity() is
  'Requirements guide staffing coverage; Founder/Admin may add or replace assignments without an artificial capacity ceiling.';

-- Requirement quantities remain operational guidance even when the current
-- assignment count is higher. Existing assignments are never removed by this
-- administrative correction.
create or replace function public.set_event_staff_requirement(
  p_project_id uuid,
  p_role text,
  p_required_quantity integer,
  p_published boolean
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  result uuid;
  event_status text;
  event_date date;
begin
  if not public.can_administer() then
    raise exception 'Solo Administración puede configurar Staff.';
  end if;
  if p_role is null or p_role not in ('OPERATOR', 'ASSEMBLY', 'DISASSEMBLY') then
    raise exception 'Responsabilidad inválida.';
  end if;
  if p_required_quantity is null or p_required_quantity < 0 or (p_required_quantity = 0 and p_published) then
    raise exception 'Cantidad requerida inválida.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':operational-assignment', 0));
  select status, projects.event_date
    into event_status, event_date
    from public.projects
   where id = p_project_id and deleted_at is null;
  if event_status is null then
    raise exception 'Evento no encontrado.';
  end if;
  if p_published and (
    event_status in ('CANCELLED', 'CLOSED', 'COMPLETED', 'ARCHIVED')
    or event_date < timezone('America/Santiago', now())::date
    or event_date > timezone('America/Santiago', now())::date + 15
  ) then
    raise exception 'Solo puedes publicar Eventos activos dentro de los próximos 15 días.';
  end if;
  insert into public.event_staff_requirements(project_id, role, required_quantity, published, created_by, updated_by)
  values (p_project_id, p_role, p_required_quantity, p_published, auth.uid(), auth.uid())
  on conflict (project_id, role) do update set
    required_quantity = excluded.required_quantity,
    published = excluded.published,
    updated_at = now(),
    updated_by = auth.uid()
  returning id into result;
  if exists(select 1 from public.project_operational_contracts where project_id = p_project_id) then
    perform public.refresh_event_operational_readiness(p_project_id, auth.uid());
  end if;
  return result;
end;
$$;

revoke all on function public.set_event_staff_requirement(uuid, text, integer, boolean) from public, anon;
grant execute on function public.set_event_staff_requirement(uuid, text, integer, boolean) to authenticated;

-- Request review is still Founder/Admin-only, but a projected requirement must
-- not reject a valid administrative assignment. The request and assignment
-- uniqueness rules remain enforced by the canonical assignment functions.
create or replace function public.review_staff_assignment_request(
  p_request_id uuid,
  p_approved boolean,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  req public.staff_assignment_requests%rowtype;
  assignment_ids uuid[];
  settlement_id uuid;
begin
  if not public.can_administer() then
    raise exception 'Solo Administración puede revisar solicitudes.';
  end if;
  select * into req from public.staff_assignment_requests where id = p_request_id for update;
  if req.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if req.status <> 'PENDING' then raise exception 'La solicitud ya fue revisada.'; end if;
  if not p_approved then
    update public.staff_assignment_requests
       set status = 'REJECTED', reviewed_at = now(), reviewed_by = auth.uid(),
           review_reason = p_reason, updated_at = now()
     where id = req.id;
    return jsonb_build_object('requestId', req.id, 'status', 'REJECTED');
  end if;
  perform set_config('orbit.timeline_boundary', 'deferred', true);
  perform pg_advisory_xact_lock(hashtextextended(req.project_id::text || ':operational-assignment', 0));
  assignment_ids := case when req.block_id is not null
    then public.assign_event_operational_responsibility_for_block(
      req.project_id, req.block_id, req.staff_id, req.responsibility,
      coalesce(nullif(p_reason, ''), 'Solicitud aprobada por Founder'))
    else public.assign_event_operational_responsibility(
      req.project_id, req.staff_id, req.responsibility,
      coalesce(nullif(p_reason, ''), 'Solicitud aprobada por Founder')) end;
  update public.assignments
     set status = 'CONFIRMED', accepted_at = req.requested_at,
         response_at = now(), updated_by = auth.uid()
   where id = any(assignment_ids) and deleted_at is null;
  settlement_id := public.refresh_staff_event_payment(req.project_id, req.staff_id, auth.uid());
  if settlement_id is null and req.block_id is not null then
    select id into settlement_id
      from public.event_staff_payments
     where assignment_id = any(assignment_ids)
       and deleted_at is null and status <> 'CANCELLED'
     limit 1;
  end if;
  if settlement_id is null then
    raise exception 'No fue posible crear la liquidación canónica del Evento.';
  end if;
  update public.event_staff_payments set status = 'CONFIRMED', updated_by = auth.uid() where id = settlement_id;
  update public.staff_assignment_requests
     set status = 'CONFIRMED', reviewed_at = now(), reviewed_by = auth.uid(),
         review_reason = p_reason, updated_at = now()
   where id = req.id;
  perform public.refresh_event_operational_readiness(req.project_id, auth.uid());
  return jsonb_build_object('requestId', req.id, 'status', 'CONFIRMED', 'assignmentIds', assignment_ids, 'settlementId', settlement_id);
end;
$$;

revoke all on function public.review_staff_assignment_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_staff_assignment_request(uuid, boolean, text) to authenticated;

commit;

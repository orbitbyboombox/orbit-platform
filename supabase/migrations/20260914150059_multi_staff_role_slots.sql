begin;

-- Preserve legacy zero (explicitly disabled roles), remove the arbitrary 99 cap.
alter table public.event_staff_requirements drop constraint if exists event_staff_requirements_required_quantity_check;
alter table public.event_staff_requirements add constraint event_staff_requirements_required_quantity_check check(required_quantity >= 0);

create or replace function public.set_event_staff_requirement(
  p_project_id uuid,p_role text,p_required_quantity integer,p_published boolean
) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; event_status text; event_date date; occupied integer;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede configurar Staff.'; end if;
  if p_role is null or p_role not in('OPERATOR','ASSEMBLY','DISASSEMBLY') then raise exception 'Responsabilidad inválida.'; end if;
  if p_required_quantity is null or p_required_quantity < 0 or (p_required_quantity=0 and p_published) then raise exception 'Cantidad requerida inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':operational-assignment',0));
  select status,projects.event_date into event_status,event_date from public.projects where id=p_project_id and deleted_at is null;
  if event_status is null then raise exception 'Evento no encontrado.'; end if;
  if p_published and (event_status in('CANCELLED','CLOSED','COMPLETED','ARCHIVED') or event_date<timezone('America/Santiago',now())::date or event_date>timezone('America/Santiago',now())::date+15) then
    raise exception 'Solo puedes publicar Eventos activos dentro de los próximos 15 días.';
  end if;
  select count(*) into occupied from public.assignments where project_id=p_project_id and assignment_type=p_role and deleted_at is null and status not in('CANCELLED','REJECTED');
  if p_required_quantity < occupied then raise exception 'Hay % Staff activos en este rol. Cancela individualmente antes de quitar sus slots.',occupied; end if;
  insert into public.event_staff_requirements(project_id,role,required_quantity,published,created_by,updated_by)
  values(p_project_id,p_role,p_required_quantity,p_published,auth.uid(),auth.uid())
  on conflict(project_id,role) do update set required_quantity=excluded.required_quantity,published=excluded.published,updated_at=now(),updated_by=auth.uid()
  returning id into result;
  if exists(select 1 from public.project_operational_contracts where project_id=p_project_id) then
    perform public.refresh_event_operational_readiness(p_project_id,auth.uid());
  end if;
  return result;
end $$;
revoke all on function public.set_event_staff_requirement(uuid,text,integer,boolean) from public,anon;
grant execute on function public.set_event_staff_requirement(uuid,text,integer,boolean) to authenticated;

-- All entry points still write assignments and use their existing payment,
-- availability, portal, cancellation and projection triggers. No second ledger.
create or replace function public.guard_event_staff_capacity()
returns trigger language plpgsql security invoker set search_path=public as $$
declare required integer; occupied integer;
begin
  if new.assignment_type not in('OPERATOR','ASSEMBLY','DISASSEMBLY') or new.deleted_at is not null or new.status in('CANCELLED','REJECTED') then return new; end if;
  if tg_op='UPDATE' then
    if old.project_id=new.project_id and old.assignment_type=new.assignment_type and old.deleted_at is null and old.status not in('CANCELLED','REJECTED') then return new; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text||':operational-assignment',0));
  select required_quantity into required from public.event_staff_requirements where project_id=new.project_id and role=new.assignment_type;
  select count(*) into occupied from public.assignments where project_id=new.project_id and assignment_type=new.assignment_type and id<>new.id and deleted_at is null and status not in('CANCELLED','REJECTED');
  if occupied >= coalesce(required,1) then raise exception 'Todos los slots de este rol están cubiertos. Aumenta la cantidad requerida antes de asignar más Staff.'; end if;
  return new;
end $$;
revoke all on function public.guard_event_staff_capacity() from public,anon,authenticated;
create trigger assignments_capacity_guard before insert or update of project_id,assignment_type,status,deleted_at on public.assignments for each row execute function public.guard_event_staff_capacity();

create or replace function public.save_event_staff_assignment(
  p_payload jsonb,p_request_id uuid,p_assignment_id uuid default null,p_replace_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare incoming public.assignments%rowtype; existing public.assignments%rowtype; replaced public.assignments%rowtype; result uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede asignar Staff.'; end if;
  incoming:=jsonb_populate_record(null::public.assignments,p_payload);
  if incoming.project_id is null or incoming.staff_id is null or incoming.assignment_type is null or incoming.assignment_type not in('OPERATOR','ASSEMBLY','DISASSEMBLY') or p_request_id is null then raise exception 'Selecciona Staff, rol y evento.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(incoming.project_id::text||':operational-assignment',0));
  if not exists(select 1 from public.projects where id=incoming.project_id and deleted_at is null and upper(status) not in('CANCELLED','CANCELED','ARCHIVED','CLOSED','COMPLETED')) then raise exception 'El Evento no está activo para asignar Staff.'; end if;
  if p_assignment_id is null then
    select * into existing from public.assignments where id=p_request_id;
    if existing.id is not null then
      if existing.project_id<>incoming.project_id or existing.staff_id<>incoming.staff_id or existing.assignment_type<>incoming.assignment_type then raise exception 'La referencia de asignación ya fue utilizada.'; end if;
      return jsonb_build_object('id',existing.id,'replay',true);
    end if;
  end if;
  if exists(select 1 from public.assignments where project_id=incoming.project_id and staff_id=incoming.staff_id and assignment_type=incoming.assignment_type and deleted_at is null and status not in('CANCELLED','REJECTED') and id<>coalesce(p_assignment_id,p_request_id)) then raise exception 'El colaborador ya ocupa un slot de este rol.'; end if;
  if p_replace_id is not null then
    if p_assignment_id is not null then raise exception 'No puedes editar y reemplazar simultáneamente.'; end if;
    select * into replaced from public.assignments where id=p_replace_id and project_id=incoming.project_id and deleted_at is null for update;
    if replaced.id is null or replaced.status in('COMPLETED','CANCELLED','REJECTED') then raise exception 'La asignación ya no está disponible para reemplazo.'; end if;
    update public.assignments set status='CANCELLED',deleted_at=now(),reason='Staff reemplazado',updated_by=auth.uid() where id=replaced.id;
  end if;
  if p_assignment_id is not null then
    select * into existing from public.assignments where id=p_assignment_id and project_id=incoming.project_id and deleted_at is null for update;
    if existing.id is null or existing.status in('CANCELLED','REJECTED','COMPLETED') then raise exception 'La asignación ya no está disponible para edición.'; end if;
    -- Editing hours/notes must never revert a confirmed assignment to ASSIGNED.
    update public.assignments set staff_id=incoming.staff_id,assignment_type=incoming.assignment_type,
      arrival_time=incoming.arrival_time,staff_call_at=incoming.staff_call_at,staff_call_source=incoming.staff_call_source,
      start_time=incoming.start_time,finish_time=incoming.finish_time,assigned_vehicle=incoming.assigned_vehicle,
      observations=incoming.observations,reason=incoming.reason,
      resources=coalesce(existing.resources,'{}')||coalesce(incoming.resources,'{}'),updated_by=auth.uid()
    where id=existing.id returning id into result;
  else
    insert into public.assignments(id,project_id,staff_id,assignment_type,status,arrival_time,staff_call_at,staff_call_source,start_time,finish_time,assigned_vehicle,observations,resources,reason,created_by,updated_by)
    values(p_request_id,incoming.project_id,incoming.staff_id,incoming.assignment_type,'ASSIGNED',incoming.arrival_time,incoming.staff_call_at,incoming.staff_call_source,incoming.start_time,incoming.finish_time,incoming.assigned_vehicle,incoming.observations,coalesce(incoming.resources,'{}'),incoming.reason,auth.uid(),auth.uid()) returning id into result;
  end if;
  return jsonb_build_object('id',result,'replay',false);
end $$;
revoke all on function public.save_event_staff_assignment(jsonb,uuid,uuid,uuid) from public,anon;
grant execute on function public.save_event_staff_assignment(jsonb,uuid,uuid,uuid) to authenticated;

-- Person changes refresh BOTH collaborators, not just the new owner.
create or replace function public.sync_staff_payment_from_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and (old.staff_id is distinct from new.staff_id or old.project_id is distinct from new.project_id) then
    perform public.refresh_staff_event_payment(old.project_id,old.staff_id,coalesce(auth.uid(),old.updated_by));
  end if;
  perform public.refresh_staff_event_payment(coalesce(new.project_id,old.project_id),coalesce(new.staff_id,old.staff_id),coalesce(auth.uid(),new.updated_by,old.updated_by));
  return coalesce(new,old);
end $$;
revoke all on function public.sync_staff_payment_from_assignment() from public,anon,authenticated;
drop trigger assignments_staff_payment_sync on public.assignments;
create trigger assignments_staff_payment_sync after insert or delete or update of project_id,staff_id,assignment_type,status,deleted_at on public.assignments for each row execute function public.sync_staff_payment_from_assignment();

-- Replace only the legacy boolean OPERATOR x1 check; preserve every other
-- canonical readiness rule and notification boundary from the existing function.
do $migration$
declare definition text; old_check text; new_check text;
begin
  select pg_get_functiondef('public.refresh_event_operational_readiness(uuid,uuid)'::regprocedure) into definition;
  old_check:=$old$  select not exists(select 1 from public.assignments where project_id=p_project_id and assignment_type='OPERATOR' and deleted_at is null
    and status in('ASSIGNED','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED','COMPLETED')) into missing_operator;
  if missing_operator then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','STAFF','label','Falta Staff Operador confirmado.','href','#event-control-center')); end if;$old$;
  new_check:=$new$  for resource_row in
    select demand.role,demand.required_quantity,
      (select count(*) from public.assignments a where a.project_id=p_project_id and a.assignment_type=demand.role and a.deleted_at is null and a.status in('ASSIGNED','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED','COMPLETED')) covered
    from (
      select role,required_quantity from public.event_staff_requirements where project_id=p_project_id and required_quantity>0
      union all select 'OPERATOR',1 where not exists(select 1 from public.event_staff_requirements where project_id=p_project_id and role='OPERATOR')
    ) demand
  loop
    if resource_row.covered<resource_row.required_quantity then
      reasons:=reasons||jsonb_build_array(jsonb_build_object('code','STAFF:'||resource_row.role,
        'label',case resource_row.role when 'OPERATOR' then 'Operador' when 'ASSEMBLY' then 'Montaje' else 'Desmontaje' end||': '||resource_row.covered||'/'||resource_row.required_quantity||' cubiertos.','href','#staff-assignment'));
    end if;
  end loop;$new$;
  if position(old_check in definition)=0 then raise exception 'Canonical readiness baseline differs; review before applying migration.'; end if;
  execute replace(definition,old_check,new_check);
end $migration$;

-- No historical assignments, settlements, payments or receipts are rewritten.
commit;

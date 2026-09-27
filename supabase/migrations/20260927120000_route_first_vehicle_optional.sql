begin;

-- A logistics route is an operational plan. Transport is an optional assignment
-- layered on top of that plan, not a prerequisite for creating or publishing it.
alter table public.vehicle_routes
  alter column asset_id drop not null;

create table if not exists public.route_staff_assignments(
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.vehicle_routes(id) on delete cascade,
  staff_id uuid not null references public.staff(id),
  assignment_role text not null default 'ROUTE_CREW' check (assignment_role in ('ROUTE_CREW','DRIVER')),
  status text not null default 'ASSIGNED' check (status in ('ASSIGNED','REMOVED')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(route_id,staff_id,assignment_role)
);

create index if not exists route_staff_assignments_staff_idx
  on public.route_staff_assignments(staff_id, status, route_id);
create index if not exists route_staff_assignments_route_idx
  on public.route_staff_assignments(route_id, status);

alter table public.route_staff_assignments enable row level security;
drop policy if exists route_staff_assignments_admin_write on public.route_staff_assignments;
create policy route_staff_assignments_admin_write on public.route_staff_assignments
  for all using (public.can_administer()) with check (public.can_administer());
drop policy if exists route_staff_assignments_internal_read on public.route_staff_assignments;
create policy route_staff_assignments_internal_read on public.route_staff_assignments
  for select using (public.is_internal_user());
drop policy if exists route_staff_assignments_own_read on public.route_staff_assignments;
create policy route_staff_assignments_own_read on public.route_staff_assignments
  for select using (
    exists (
      select 1 from public.staff profile
      where profile.id = route_staff_assignments.staff_id
        and profile.profile_id = auth.uid()
        and profile.deleted_at is null
    )
  );

-- Preserve visibility for already-published routes whose driver was the only
-- existing operational relationship. This does not make driver the source of
-- truth for new routes.
insert into public.route_staff_assignments(route_id,staff_id,assignment_role,status,created_by,updated_by)
select route.id,route.driver_staff_id,'DRIVER','ASSIGNED',route.created_by,route.updated_by
from public.vehicle_routes route
where route.driver_staff_id is not null and route.deleted_at is null
  and not exists (
    select 1 from public.route_staff_assignments existing
    where existing.route_id=route.id and existing.staff_id=route.driver_staff_id
      and existing.assignment_role='DRIVER'
  );

-- Preserve visibility for existing published routes that were already linked
-- to Staff through event assignments. New routes use this table directly.
insert into public.route_staff_assignments(route_id,staff_id,assignment_role,status,created_by,updated_by)
select distinct route.id,assignment.staff_id,'ROUTE_CREW','ASSIGNED',route.created_by,route.updated_by
from public.vehicle_routes route
join public.vehicle_route_events route_event on route_event.route_id=route.id
join public.assignments assignment on assignment.project_id=route_event.project_id
where route.deleted_at is null
  and assignment.status in ('CONFIRMED','ASSIGNED','ACCEPTED')
  and (
    route.route_type='FULL_DAY'
    or (route.route_type='ASSEMBLY' and assignment.assignment_type='ASSEMBLY')
    or (route.route_type='DISASSEMBLY' and assignment.assignment_type='DISASSEMBLY')
  )
  and not exists (
    select 1 from public.route_staff_assignments existing
    where existing.route_id=route.id and existing.staff_id=assignment.staff_id
      and existing.assignment_role='ROUTE_CREW'
  );

create or replace function public.save_logistics_route_plan(
  p_route_id uuid,
  p_asset_id uuid,
  p_route_date date,
  p_driver_staff_id uuid,
  p_route_type text,
  p_project_ids uuid[]
) returns uuid language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); saved_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede gestionar rutas.'; end if;
  if p_route_date is null or coalesce(array_length(p_project_ids,1),0)=0 then raise exception 'La ruta requiere fecha y eventos.'; end if;
  if p_route_type not in ('ASSEMBLY','DISASSEMBLY','FULL_DAY') then raise exception 'Tipo de ruta inválido.'; end if;
  if array_length(p_project_ids,1)>5 then raise exception 'Una ruta no puede superar 5 tótems/equipos.'; end if;
  if p_route_id is null then
    insert into public.vehicle_routes(asset_id,route_date,driver_staff_id,route_type,publication_status,created_by,updated_by)
    values(p_asset_id,p_route_date,p_driver_staff_id,p_route_type,'DRAFT',actor,actor) returning id into saved_id;
  else
    update public.vehicle_routes
    set asset_id=p_asset_id,route_date=p_route_date,driver_staff_id=p_driver_staff_id,route_type=p_route_type,
        publication_status=case when publication_status='PUBLISHED' then 'MODIFIED' else 'ORDERED' end,
        updated_by=actor
    where id=p_route_id and deleted_at is null returning id into saved_id;
    if saved_id is null then raise exception 'Ruta no encontrada.'; end if;
  end if;
  delete from public.vehicle_route_events where route_id=saved_id;
  insert into public.vehicle_route_events(route_id,project_id,sequence,created_by)
  select saved_id,project_id,row_number() over (),actor from unnest(p_project_ids) project_id;
  return saved_id;
end $$;

create or replace function public.set_logistics_route_staff(p_route_id uuid,p_staff_ids uuid[])
returns integer language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); inserted_count integer:=0;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede asignar equipo.'; end if;
  if not exists(select 1 from public.vehicle_routes where id=p_route_id and deleted_at is null) then raise exception 'Ruta no encontrada.'; end if;
  update public.route_staff_assignments set status='REMOVED',updated_by=actor,updated_at=now()
  where route_id=p_route_id and status='ASSIGNED';
  insert into public.route_staff_assignments(route_id,staff_id,assignment_role,status,created_by,updated_by)
  select p_route_id,staff_id,'ROUTE_CREW','ASSIGNED',actor,actor
  from (select distinct unnest(coalesce(p_staff_ids, '{}'::uuid[])) staff_id) selected
  where exists(select 1 from public.staff where id=selected.staff_id and deleted_at is null and status='ACTIVE')
  on conflict(route_id,staff_id,assignment_role) do update set status='ASSIGNED',updated_by=actor,updated_at=now();
  get diagnostics inserted_count=row_count;
  update public.vehicle_routes set updated_by=actor,updated_at=now() where id=p_route_id;
  return inserted_count;
end $$;

create or replace function public.publish_logistics_route(p_route_id uuid)
returns integer language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); route public.vehicle_routes; revision_id uuid; next_version integer; project_id uuid; staff_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede publicar rutas.'; end if;
  select * into route from public.vehicle_routes where id=p_route_id and deleted_at is null for update;
  if not found then raise exception 'Ruta no encontrada.'; end if;
  if not exists(select 1 from public.vehicle_route_events where route_id=p_route_id) then raise exception 'La ruta no tiene paradas.'; end if;
  if not exists(select 1 from public.route_staff_assignments where route_id=p_route_id and status='ASSIGNED') then raise exception 'Asigna al menos un Staff antes de publicar.'; end if;
  select coalesce(max(version),0)+1 into next_version from public.vehicle_route_revisions where route_id=p_route_id;
  insert into public.vehicle_route_revisions(route_id,version,route_type,published_at,published_by) values(p_route_id,next_version,route.route_type,now(),actor) returning id into revision_id;
  insert into public.vehicle_route_revision_events(revision_id,project_id,sequence) select revision_id,project_id,sequence from public.vehicle_route_events where route_id=p_route_id order by sequence;
  update public.vehicle_routes set publication_status='PUBLISHED',published_at=now(),published_by=actor,publication_version=next_version,updated_by=actor where id=p_route_id;
  foreach project_id in array (select array_agg(event.project_id order by event.sequence) from public.vehicle_route_events event where event.route_id=p_route_id) loop
    foreach staff_id in array (select array_agg(assignment.staff_id) from public.route_staff_assignments assignment where assignment.route_id=p_route_id and assignment.status='ASSIGNED') loop
      insert into public.internal_notifications(project_id,notification_type,title,message,status,correlation_id,category,priority,action_required,staff_id,entity_type,entity_id,metadata)
      values(project_id,'ROUTE_PUBLISHED',case when route.route_type='ASSEMBLY' then 'Nueva ruta de montaje disponible' else 'Nueva ruta de desmontaje disponible' end,case when route.route_type='ASSEMBLY' then 'Nueva ruta de montaje disponible para '||to_char(route.route_date,'TMDay DD "de" TMMonth')||'.' else 'Nueva ruta de desmontaje disponible para '||to_char(route.route_date,'TMDay DD "de" TMMonth')||'.' end,'UNREAD','route:'||p_route_id::text||':'||next_version::text||':'||staff_id::text,'OPERATIONS','NORMAL',true,staff_id,'VehicleRoute',p_route_id::text,jsonb_build_object('routeType',route.route_type,'version',next_version));
    end loop;
  end loop;
  return next_version;
end $$;

revoke all on function public.set_logistics_route_staff(uuid,uuid[]) from public,anon;
grant execute on function public.set_logistics_route_staff(uuid,uuid[]) to authenticated;

commit;

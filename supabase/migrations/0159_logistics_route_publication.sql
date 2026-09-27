begin;

alter table public.vehicle_routes
  add column if not exists route_type text not null default 'FULL_DAY'
    check (route_type in ('ASSEMBLY','DISASSEMBLY','FULL_DAY')),
  add column if not exists publication_status text not null default 'DRAFT'
    check (publication_status in ('DRAFT','ORDERED','PUBLISHED','MODIFIED')),
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id),
  add column if not exists publication_version integer not null default 0 check (publication_version >= 0);

alter table public.vehicle_route_events
  add column if not exists sequence integer not null default 1 check (sequence > 0);

create table if not exists public.vehicle_route_revisions (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.vehicle_routes(id),
  version integer not null check (version > 0),
  route_type text not null check (route_type in ('ASSEMBLY','DISASSEMBLY','FULL_DAY')),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(route_id, version)
);

create table if not exists public.vehicle_route_revision_events (
  revision_id uuid not null references public.vehicle_route_revisions(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  sequence integer not null check (sequence > 0),
  primary key (revision_id, project_id),
  unique (revision_id, sequence)
);

create index if not exists vehicle_routes_publication_idx
  on public.vehicle_routes(route_date, publication_status, route_type)
  where deleted_at is null;
create index if not exists vehicle_route_events_sequence_idx
  on public.vehicle_route_events(route_id, sequence);
create index if not exists vehicle_route_revisions_route_idx
  on public.vehicle_route_revisions(route_id, version desc);

-- Existing ACTIVE routes are already official operational routes; preserve Staff visibility.
update public.vehicle_routes
set publication_status='PUBLISHED',
    route_type=coalesce(nullif(route_type,''),'FULL_DAY'),
    publication_version=greatest(publication_version,1),
    published_at=coalesce(published_at,created_at),
    published_by=coalesce(published_by,created_by)
where status='ACTIVE' and deleted_at is null and publication_status='DRAFT';

with ordered as (
  select id, row_number() over (partition by route_id order by created_at, id) as sequence
  from public.vehicle_route_events
)
update public.vehicle_route_events event
set sequence=ordered.sequence
from ordered
where event.id=ordered.id;

insert into public.vehicle_route_revisions(route_id,version,route_type,published_at,published_by)
select route.id, 1, route.route_type, coalesce(route.published_at,route.created_at), route.published_by
from public.vehicle_routes route
where route.publication_status='PUBLISHED'
  and route.deleted_at is null
  and not exists (select 1 from public.vehicle_route_revisions revision where revision.route_id=route.id);

insert into public.vehicle_route_revision_events(revision_id,project_id,sequence)
select revision.id,event.project_id,event.sequence
from public.vehicle_route_revisions revision
join public.vehicle_route_events event on event.route_id=revision.route_id
where revision.version=1
on conflict do nothing;

alter table public.vehicle_route_revisions enable row level security;
alter table public.vehicle_route_revision_events enable row level security;
drop policy if exists vehicle_route_revisions_internal_read on public.vehicle_route_revisions;
create policy vehicle_route_revisions_internal_read on public.vehicle_route_revisions for select using (public.is_internal_user());
drop policy if exists vehicle_route_revisions_admin_write on public.vehicle_route_revisions;
create policy vehicle_route_revisions_admin_write on public.vehicle_route_revisions for all using (public.can_administer()) with check (public.can_administer());
drop policy if exists vehicle_route_revision_events_internal_read on public.vehicle_route_revision_events;
create policy vehicle_route_revision_events_internal_read on public.vehicle_route_revision_events for select using (public.is_internal_user());
drop policy if exists vehicle_route_revision_events_admin_write on public.vehicle_route_revision_events;
create policy vehicle_route_revision_events_admin_write on public.vehicle_route_revision_events for all using (public.can_administer()) with check (public.can_administer());

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
  if p_asset_id is null or p_route_date is null or coalesce(array_length(p_project_ids,1),0)=0 then raise exception 'La ruta requiere vehículo, fecha y eventos.'; end if;
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

create or replace function public.reorder_logistics_route(p_route_id uuid,p_project_ids uuid[])
returns void language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); expected integer; actual integer;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede ordenar rutas.'; end if;
  select count(*) into expected from public.vehicle_route_events where route_id=p_route_id;
  if expected<>coalesce(array_length(p_project_ids,1),0) then raise exception 'La secuencia no coincide con las paradas de la ruta.'; end if;
  select count(*) into actual from (select distinct unnest(p_project_ids)) valueset;
  if expected<>actual then raise exception 'La ruta contiene paradas duplicadas.'; end if;
  update public.vehicle_route_events event set sequence=ordered.sequence
  from (select project_id,row_number() over () as sequence from unnest(p_project_ids) project_id) ordered
  where event.route_id=p_route_id and event.project_id=ordered.project_id;
  update public.vehicle_routes set publication_status=case when publication_status='PUBLISHED' then 'MODIFIED' else 'ORDERED' end,updated_by=actor where id=p_route_id and deleted_at is null;
end $$;

create or replace function public.publish_logistics_route(p_route_id uuid)
returns integer language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); route public.vehicle_routes; revision_id uuid; next_version integer; direction text; project_id uuid; staff_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede publicar rutas.'; end if;
  select * into route from public.vehicle_routes where id=p_route_id and deleted_at is null for update;
  if not found then raise exception 'Ruta no encontrada.'; end if;
  if not exists(select 1 from public.vehicle_route_events where route_id=p_route_id) then raise exception 'La ruta no tiene paradas.'; end if;
  select coalesce(max(version),0)+1 into next_version from public.vehicle_route_revisions where route_id=p_route_id;
  insert into public.vehicle_route_revisions(route_id,version,route_type,published_at,published_by) values(p_route_id,next_version,route.route_type,now(),actor) returning id into revision_id;
  insert into public.vehicle_route_revision_events(revision_id,project_id,sequence) select revision_id,project_id,sequence from public.vehicle_route_events where route_id=p_route_id order by sequence;
  update public.vehicle_routes set publication_status='PUBLISHED',published_at=now(),published_by=actor,publication_version=next_version,updated_by=actor where id=p_route_id;
  foreach project_id in array (select array_agg(event.project_id order by event.sequence) from public.vehicle_route_events event where event.route_id=p_route_id) loop
    foreach staff_id in array (select array_agg(distinct assignment.staff_id) from public.assignments assignment where assignment.project_id=project_id and assignment.deleted_at is null and assignment.status not in ('CANCELLED','REJECTED') and (route.route_type='FULL_DAY' or assignment.assignment_type=case when route.route_type='ASSEMBLY' then 'ASSEMBLY' else 'DISASSEMBLY' end)) loop
      insert into public.internal_notifications(project_id,notification_type,title,message,status,correlation_id,category,priority,action_required,staff_id,entity_type,entity_id,metadata)
      values(project_id,'ROUTE_PUBLISHED',case when route.route_type='ASSEMBLY' then 'Nueva ruta de montaje disponible' else 'Nueva ruta de desmontaje disponible' end,case when route.route_type='ASSEMBLY' then 'Nueva ruta de montaje disponible para '||to_char(route.route_date,'TMDay DD "de" TMMonth')||'.' else 'Nueva ruta de desmontaje disponible para '||to_char(route.route_date,'TMDay DD "de" TMMonth')||'.' end,'UNREAD','route:'||p_route_id::text||':'||next_version::text||':'||staff_id::text,'OPERATIONS','NORMAL',true,staff_id,'VehicleRoute',p_route_id::text,jsonb_build_object('routeType',route.route_type,'version',next_version));
    end loop;
  end loop;
  return next_version;
end $$;

revoke all on function public.save_logistics_route_plan(uuid,uuid,date,uuid,text,uuid[]) from public,anon;
revoke all on function public.reorder_logistics_route(uuid,uuid[]) from public,anon;
revoke all on function public.publish_logistics_route(uuid) from public,anon;
grant execute on function public.save_logistics_route_plan(uuid,uuid,date,uuid,text,uuid[]) to authenticated;
grant execute on function public.reorder_logistics_route(uuid,uuid[]) to authenticated;
grant execute on function public.publish_logistics_route(uuid) to authenticated;

commit;

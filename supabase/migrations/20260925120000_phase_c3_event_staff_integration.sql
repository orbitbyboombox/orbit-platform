begin;

-- Phase C.3 keeps the canonical asset graph and adds only the missing TEST
-- parity/transaction boundary for Staff checkout and check-in.
-- CHECK_IN delegates media accounting to the canonical EVENT_USAGE RPC from C.2A.
alter table public.asset_assignments
  add column if not exists return_condition text check(return_condition in('OK','DAMAGED','MISSING','REQUIRES_REVIEW')),
  add column if not exists return_notes text,
  add column if not exists return_confirmed_by uuid references auth.users(id),
  add column if not exists return_confirmed_at timestamptz;

alter table public.asset_assignment_inspections
  add column if not exists idempotency_key text;
create unique index if not exists asset_assignment_inspections_idempotency_idx
  on public.asset_assignment_inspections(idempotency_key)
  where idempotency_key is not null;

-- TEST did not yet contain the canonical incident table. This is the same
-- operational incident contract used by Production, not a parallel FK model.
create table if not exists public.event_incidents(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  asset_id uuid references public.operational_assets(id),
  asset_assignment_id uuid references public.asset_assignments(id),
  incident_type text not null check(incident_type in('EQUIPMENT','STAFF','CLIENT','DELAY','LOSS','OTHER')),
  severity text not null check(severity in('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check(status in('OPEN','RESOLVED','ACKNOWLEDGED')),
  description text not null check(length(trim(description))>=3),
  responsible text,
  resolution text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(asset_assignment_id,incident_type)
);
create index if not exists event_incidents_gate_idx on public.event_incidents(project_id,status,severity);
alter table public.event_incidents enable row level security;
drop policy if exists event_incidents_internal_read on public.event_incidents;
create policy event_incidents_internal_read on public.event_incidents for select using(public.is_internal_user());
revoke all on table public.event_incidents from anon,authenticated;

create or replace function public.record_staff_box_check_out(
  p_project_id uuid,
  p_asset_assignment_id uuid,
  p_components jsonb,
  p_idempotency_key text,
  p_staff_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; component jsonb; component_id uuid; result_count integer:=0;
begin
  if p_project_id is null or p_asset_assignment_id is null or p_staff_id is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'Datos de CHECK_OUT incompletos.'; end if;
  select a.id,a.asset_id,a.assignment_status into item
  from public.asset_assignments a
  join public.assignments sa on sa.project_id=a.project_id and sa.staff_id=p_staff_id and sa.deleted_at is null
    and sa.status in('CONFIRMED','ACCEPTED','COMPLETED') and sa.assignment_type in('OPERATOR','ASSEMBLY')
  where a.id=p_asset_assignment_id and a.project_id=p_project_id and a.deleted_at is null and a.assignment_status='ASSIGNED';
  if not found then raise exception 'Staff no autorizado para CHECK_OUT de esta Caja.'; end if;
  for component in select value from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) loop
    component_id:=(component->>'componentId')::uuid;
    if component->>'status' not in('OK','MISSING','DAMAGED','MAINTENANCE_REQUIRED') then raise exception 'Estado de componente inválido.'; end if;
    insert into public.asset_assignment_inspections(asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,idempotency_key,inspected_by,created_by,updated_by)
    values(item.id,component_id,'CHECK_OUT',component->>'status',nullif(trim(component->>'notes'),''),coalesce((component->>'incident')::boolean,false),p_idempotency_key||':'||component_id,p_staff_id,p_staff_id,p_staff_id)
    on conflict (asset_assignment_id,inspection_type,component_asset_id) do nothing;
    result_count:=result_count+1;
  end loop;
  return jsonb_build_object('assignmentId',item.id,'inspectionType','CHECK_OUT','components',result_count,'duplicate',result_count=0);
end $$;

create or replace function public.record_staff_box_check_in(
  p_project_id uuid,
  p_asset_assignment_id uuid,
  p_media_lot_id uuid,
  p_remaining_photo_capacity numeric,
  p_components jsonb,
  p_note text,
  p_incident boolean,
  p_idempotency_key text,
  p_staff_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; component jsonb; component_id uuid; movement_result jsonb; actor_id uuid; result_count integer:=0;
begin
  if p_project_id is null or p_asset_assignment_id is null or p_media_lot_id is null or p_staff_id is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'Datos de CHECK_IN incompletos.'; end if;
  select a.id,a.asset_id,a.assignment_status into item
  from public.asset_assignments a
  join public.assignments sa on sa.project_id=a.project_id and sa.staff_id=p_staff_id and sa.deleted_at is null
    and sa.status in('CONFIRMED','ACCEPTED','COMPLETED') and sa.assignment_type in('OPERATOR','DISASSEMBLY')
  where a.id=p_asset_assignment_id and a.project_id=p_project_id and a.deleted_at is null;
  if not found then raise exception 'Staff no autorizado para CHECK_IN de esta Caja.'; end if;
  select s.profile_id into actor_id from public.staff s where s.id=p_staff_id;
  select public.record_staff_box_media_return(p_project_id,p_media_lot_id,p_remaining_photo_capacity,p_note,p_incident,p_idempotency_key,p_staff_id) into movement_result;
  for component in select value from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) loop
    component_id:=(component->>'componentId')::uuid;
    if component->>'status' not in('OK','MISSING','DAMAGED','MAINTENANCE_REQUIRED') then raise exception 'Estado de componente inválido.'; end if;
    insert into public.asset_assignment_inspections(asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,idempotency_key,inspected_by,created_by,updated_by)
    values(item.id,component_id,'CHECK_IN',component->>'status',nullif(trim(component->>'notes'),''),coalesce((component->>'incident')::boolean,false),p_idempotency_key||':'||component_id,p_staff_id,actor_id,actor_id)
    on conflict (asset_assignment_id,inspection_type,component_asset_id) do nothing;
    result_count:=result_count+1;
  end loop;
  update public.asset_assignments set assignment_status='RETURNED',return_condition=case when p_incident then 'REQUIRES_REVIEW' else 'OK' end,
    return_notes=nullif(trim(p_note),''),return_confirmed_by=actor_id,return_confirmed_at=now(),returned_at=coalesce(returned_at,now()),updated_by=actor_id
  where id=item.id;
  update public.operational_assets set status=case when p_incident then 'MAINTENANCE' else 'AVAILABLE' end,updated_by=actor_id where id=item.asset_id;
  if p_incident and actor_id is not null then
    insert into public.event_incidents(project_id,asset_id,asset_assignment_id,incident_type,severity,status,description,created_by)
    values(p_project_id,item.asset_id,item.id,'EQUIPMENT','HIGH','OPEN',coalesce(nullif(trim(p_note),''),'Incidente operacional informado por Staff.'),actor_id)
    on conflict(asset_assignment_id,incident_type) do update set status='OPEN',severity='HIGH',description=excluded.description,updated_at=now();
  end if;
  return jsonb_build_object('assignmentId',item.id,'movement',movement_result,'components',result_count,'reviewRequired',p_incident);
end $$;

revoke all on function public.record_staff_box_check_out(uuid,uuid,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.record_staff_box_check_in(uuid,uuid,uuid,numeric,jsonb,text,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.record_staff_box_check_out(uuid,uuid,jsonb,text,uuid) to service_role;
grant execute on function public.record_staff_box_check_in(uuid,uuid,uuid,numeric,jsonb,text,boolean,text,uuid) to service_role;

commit;

begin;

alter table public.project_operational_contracts
  add column if not exists logistics_reason text,
  add column if not exists parking_status text check(parking_status is null or parking_status in('AVAILABLE','INCLUDED','PAID','UNAVAILABLE','UNKNOWN')),
  add column if not exists max_access_height numeric(6,2),
  add column if not exists loading_access text,
  add column if not exists logistics_notes text,
  add column if not exists logistics_closed_at timestamptz,
  add column if not exists logistics_closed_by uuid references auth.users(id),
  add column if not exists logistics_close_reason text;

alter table public.vehicle_profiles
  add column if not exists height_m numeric(6,2),
  add column if not exists length_m numeric(6,2),
  add column if not exists width_m numeric(6,2),
  add column if not exists capacity_notes text;

alter table public.expenses
  add column if not exists idempotency_key text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id);
create unique index if not exists expenses_idempotency_key_unique on public.expenses(idempotency_key) where idempotency_key is not null and deleted_at is null;

create or replace function public.refresh_event_logistics(p_project_id uuid,p_actor_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public as $$
declare mode text; next_status text; trips integer; complete_trips integer; closed_at timestamptz;
begin
  select logistics_mode,logistics_closed_at into mode,closed_at from public.project_operational_contracts where project_id=p_project_id for update;
  if mode is null then raise exception 'Contrato operacional no preparado.'; end if;
  select count(*),count(*)filter(where status='COMPLETED') into trips,complete_trips from public.vehicle_trips where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';
  next_status:=case when mode='NOT_REQUIRED' then 'NOT_REQUIRED' when closed_at is not null then 'COMPLETED' when trips=0 then 'PENDING' when exists(select 1 from public.vehicle_trips where project_id=p_project_id and deleted_at is null and status in('IN_PROGRESS','ARRIVED')) then 'IN_PROGRESS' else 'PLANNED' end;
  update public.project_operational_contracts set logistics_status=next_status,updated_by=p_actor_id where project_id=p_project_id;
  return jsonb_build_object('mode',mode,'status',next_status,'trips',trips,'completeTrips',complete_trips);
end $$;

create or replace function public.save_event_logistics_settings(p_project_id uuid,p_changes jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Administración puede gestionar logística.'; end if;
  update public.project_operational_contracts set
    logistics_reason=nullif(trim(p_changes->>'reason'),''),
    parking_status=nullif(p_changes->>'parkingStatus',''),
    max_access_height=nullif(p_changes->>'maxAccessHeight','')::numeric,
    loading_access=nullif(trim(p_changes->>'loadingAccess'),''),
    logistics_notes=nullif(trim(p_changes->>'notes'),''),updated_by=auth.uid()
  where project_id=p_project_id;
end $$;

create or replace function public.review_event_logistics_expense(p_expense_id uuid,p_status text)
returns void language plpgsql security invoker set search_path=public as $$
declare project uuid;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Administración puede revisar gastos.'; end if;
  if p_status not in('APPROVED','REJECTED') then raise exception 'Revisión inválida.'; end if;
  update public.expenses set status=p_status,reviewed_at=now(),reviewed_by=auth.uid(),updated_by=auth.uid() where id=p_expense_id and vehicle_trip_id is not null and deleted_at is null returning project_id into project;
  if project is null then raise exception 'Gasto logístico no encontrado.'; end if;
end $$;

create or replace function public.close_event_logistics(p_project_id uuid,p_override_reason text default null)
returns void language plpgsql security invoker set search_path=public as $$
declare pending_trips integer; pending_expenses integer;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Administración puede cerrar logística.'; end if;
  select count(*) into pending_trips from public.vehicle_trips where project_id=p_project_id and deleted_at is null and status not in('COMPLETED','CANCELLED');
  select count(*) into pending_expenses from public.expenses where project_id=p_project_id and vehicle_trip_id is not null and deleted_at is null and status='PENDING';
  if (pending_trips>0 or pending_expenses>0) and nullif(trim(coalesce(p_override_reason,'')),'') is null then raise exception 'Cierre pendiente: % viaje(s) y % gasto(s) requieren resolución.',pending_trips,pending_expenses; end if;
  update public.project_operational_contracts set logistics_closed_at=now(),logistics_closed_by=auth.uid(),logistics_close_reason=nullif(trim(p_override_reason),''),logistics_status='COMPLETED',updated_by=auth.uid() where project_id=p_project_id;
  perform public.refresh_event_operational_readiness(p_project_id,auth.uid());
end $$;

create or replace function public.event_logistics_project_changed() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in('CANCELLED','Cancelled') and old.status is distinct from new.status then
    update public.vehicle_trips set status='CANCELLED',deleted_at=now(),updated_by=new.updated_by where project_id=new.id and deleted_at is null and status in('PLANNED','IN_PROGRESS','ARRIVED');
    update public.event_vehicle_assignments set status='CANCELLED',updated_by=new.updated_by where project_id=new.id and deleted_at is null and status='ASSIGNED';
  elsif (old.event_date,old.event_time,old.location,old.city,old.operations->>'eventAddress') is distinct from (new.event_date,new.event_time,new.location,new.city,new.operations->>'eventAddress') and exists(select 1 from public.vehicle_trips where project_id=new.id and deleted_at is null and status='PLANNED') then
    update public.project_operational_contracts set logistics_status='PENDING',logistics_closed_at=null,logistics_closed_by=null,logistics_close_reason=null,updated_by=new.updated_by where project_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists event_logistics_project_sync on public.projects;
create trigger event_logistics_project_sync after update of status,event_date,event_time,location,city,operations on public.projects for each row execute function public.event_logistics_project_changed();

revoke all on function public.save_event_logistics_settings(uuid,jsonb) from public,anon;
revoke all on function public.review_event_logistics_expense(uuid,text) from public,anon;
revoke all on function public.close_event_logistics(uuid,text) from public,anon;
grant execute on function public.save_event_logistics_settings(uuid,jsonb) to authenticated;
grant execute on function public.review_event_logistics_expense(uuid,text) to authenticated;
grant execute on function public.close_event_logistics(uuid,text) to authenticated;

commit;

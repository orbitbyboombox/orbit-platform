begin;

-- Phase C.6: Master Admin assignment snapshot for CASE-01..CASE-09.
-- Reuses asset_assignments and event_paper_snapshots. No Staff closeout or
-- Master stock mutation is performed in this phase.
alter table public.event_paper_snapshots
  add column if not exists black_box_asset_code text,
  add column if not exists black_box_name text,
  add column if not exists black_box_initial_photo_stock numeric(14,3),
  add column if not exists black_box_paper_format text,
  add column if not exists black_box_assigned_at timestamptz,
  add column if not exists black_box_assigned_by uuid references auth.users(id);

create index if not exists event_paper_snapshots_black_box_project_idx
  on public.event_paper_snapshots(project_id,black_box_asset_code,created_at desc)
  where black_box_asset_code is not null;

create or replace function public.phase_c5_capture_event_paper_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$
declare asset_row record; metadata_row jsonb; box_type text; printer_id uuid; lot_row record; requires_paper boolean;
begin
  select a.id,a.asset_type,a.asset_code,a.metadata into asset_row
  from public.operational_assets a where a.id=new.asset_id and a.deleted_at is null;
  if not found or new.deleted_at is not null or new.assignment_status<>'ASSIGNED' then return new; end if;

  -- CASE assets use the Master snapshot and deliberately do not set
  -- paper_required: Staff closeout is a later phase.
  if asset_row.asset_type='CASE' and asset_row.asset_code ~ '^CASE-0[1-9]$' then
    metadata_row:=coalesce(asset_row.metadata,'{}'::jsonb);
    insert into public.event_paper_snapshots(
      project_id,orbit_event_id,asset_assignment_id,box_asset_id,paper_required,opening_balance,status,
      black_box_asset_code,black_box_name,black_box_initial_photo_stock,black_box_paper_format,
      black_box_assigned_at,black_box_assigned_by
    )
    select p.id,p.orbit_event_id,new.id,new.asset_id,false,
      coalesce((metadata_row->>'blackBoxPhotoStock')::numeric,0),'PENDING',
      asset_row.asset_code,coalesce(nullif(metadata_row->>'name',''),'Caja '||right(asset_row.asset_code,2)::integer),
      coalesce((metadata_row->>'blackBoxPhotoStock')::numeric,0),coalesce(nullif(metadata_row->>'blackBoxPaperFormat',''),'4X6'),
      new.assigned_at,new.assigned_by
    from public.projects p where p.id=new.project_id
      and not exists(select 1 from public.event_paper_snapshots s where s.asset_assignment_id=new.id);
    return new;
  end if;

  if asset_row.asset_type is distinct from 'BOX' then return new; end if;
  select a.id into printer_id from public.operational_assets a
    where a.parent_asset_id=new.asset_id and a.asset_type='PRINTER' and a.deleted_at is null
    order by a.asset_code limit 1;
  requires_paper:=printer_id is not null;
  select l.id,l.printer_asset_id,l.format_key,l.lot,l.remaining_photo_capacity
    into lot_row from public.box_media_lots l
    where l.box_asset_id=new.asset_id and l.status='ACTIVE'
    order by l.loaded_at desc limit 1;
  insert into public.event_paper_snapshots(
    project_id,orbit_event_id,asset_assignment_id,box_asset_id,printer_asset_id,media_lot_id,
    format_key,lot,paper_required,opening_balance,status
  )
  select p.id,p.orbit_event_id,new.id,new.asset_id,coalesce(lot_row.printer_asset_id,printer_id),lot_row.id,
    lot_row.format_key,lot_row.lot,requires_paper,coalesce(lot_row.remaining_photo_capacity,0),'PENDING'
  from public.projects p where p.id=new.project_id
    and not exists(select 1 from public.event_paper_snapshots s where s.asset_assignment_id=new.id);
  return new;
end $$;

create or replace function public.assign_black_box_to_event(
  p_project_id uuid,p_asset_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); project_row record; asset_row record; current_row record;
  window_row record; assignment_id uuid; old_assignment_id uuid; old_asset_id uuid; replaced boolean:=false;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Master Admin puede asignar Cajas Negras.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'La asignación requiere un motivo.'; end if;
  select p.id,p.orbit_event_id into project_row from public.projects p where p.id=p_project_id and p.deleted_at is null;
  if not found then raise exception 'Evento no encontrado.'; end if;
  select a.* into asset_row from public.operational_assets a where a.id=p_asset_id and a.deleted_at is null for update;
  if not found or asset_row.asset_type<>'CASE' or asset_row.asset_code not in('CASE-01','CASE-02','CASE-03','CASE-04','CASE-05','CASE-06','CASE-07','CASE-08','CASE-09') then
    raise exception 'Solo CASE-01 a CASE-09 pueden asignarse como Cajas Negras.';
  end if;
  if asset_row.status in('MAINTENANCE','OUT_OF_SERVICE') then raise exception 'La Caja Negra no está operativa.'; end if;
  select * into window_row from public.event_operational_window(p_project_id);
  if window_row.window_start is null or window_row.window_end is null then raise exception 'Confirma la ventana operacional antes de asignar la Caja.'; end if;
  select aa.* into current_row from public.asset_assignments aa
    join public.operational_assets ca on ca.id=aa.asset_id
    where aa.project_id=p_project_id and aa.assignment_status='ASSIGNED' and aa.deleted_at is null
      and ca.asset_type='CASE' and ca.asset_code like 'CASE-0%' for update;
  if found and current_row.asset_id=p_asset_id then
    return jsonb_build_object('assignmentId',current_row.id,'replaced',false,'unchanged',true);
  end if;
  if found then
    old_assignment_id:=current_row.id; old_asset_id:=current_row.asset_id; replaced:=true;
    update public.asset_assignments set assignment_status='RETURNED',returned_at=now(),released_by=actor,
      release_reason=trim(p_reason),updated_by=actor where id=current_row.id;
    update public.operational_assets set status=case when exists(select 1 from public.asset_assignments where asset_id=old_asset_id and assignment_status='ASSIGNED' and deleted_at is null) then 'ASSIGNED' else 'AVAILABLE' end,updated_by=actor where id=old_asset_id;
  end if;
  if exists(select 1 from public.asset_assignments aa where aa.asset_id=p_asset_id and aa.assignment_status='ASSIGNED' and aa.deleted_at is null
    and aa.planned_start_at is not null and aa.planned_end_at is not null
    and tstzrange(aa.planned_start_at,aa.planned_end_at,'[)') && tstzrange(window_row.window_start,window_row.window_end,'[)')) then
    raise exception 'CONFLICTO DE DISPONIBILIDAD: la Caja ya está asignada durante esta ventana.';
  end if;
  insert into public.asset_assignments(project_id,asset_id,assignment_status,assigned_by,assigned_at,planned_start_at,planned_end_at,reason,created_by,updated_by)
  values(p_project_id,p_asset_id,'ASSIGNED',actor,now(),window_row.window_start,window_row.window_end,trim(p_reason),actor,actor)
  returning id into assignment_id;
  update public.operational_assets set status=case when status='AVAILABLE' then 'ASSIGNED' else status end,usage_counter=usage_counter+1,updated_by=actor where id=p_asset_id;
  insert into public.asset_history(asset_id,project_id,history_type,message,previous_state,new_state,actor_id,orbit_event_id,correlation_id)
  values(p_asset_id,p_project_id,'OPERATION',asset_row.asset_code||' asignada como Caja Negra.',jsonb_build_object('replacedAssignmentId',old_assignment_id),jsonb_build_object('assignmentId',assignment_id,'reason',trim(p_reason)),actor,project_row.orbit_event_id,'black-box-assign:'||assignment_id);
  return jsonb_build_object('assignmentId',assignment_id,'replaced',replaced,'replacedAssignmentId',old_assignment_id);
exception when exclusion_violation then raise exception 'CONFLICTO DE DISPONIBILIDAD: otro administrador asignó la Caja durante esta operación.';
end $$;

create or replace function public.remove_black_box_from_event(p_project_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); item record; project_row record;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Master Admin puede quitar Cajas Negras.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'La eliminación requiere un motivo.'; end if;
  select p.id,p.orbit_event_id into project_row from public.projects p where p.id=p_project_id and p.deleted_at is null;
  if not found then raise exception 'Evento no encontrado.'; end if;
  select aa.*,asset.asset_code into item from public.asset_assignments aa join public.operational_assets asset on asset.id=aa.asset_id
    where aa.project_id=p_project_id and aa.assignment_status='ASSIGNED' and aa.deleted_at is null and asset.asset_type='CASE' and asset.asset_code like 'CASE-0%' for update;
  if not found then return jsonb_build_object('removed',false); end if;
  update public.asset_assignments set assignment_status='RETURNED',returned_at=now(),released_by=actor,release_reason=trim(p_reason),updated_by=actor where id=item.id;
  update public.operational_assets set status=case when exists(select 1 from public.asset_assignments where asset_id=item.asset_id and assignment_status='ASSIGNED' and deleted_at is null) then 'ASSIGNED' else 'AVAILABLE' end,updated_by=actor where id=item.asset_id;
  insert into public.asset_history(asset_id,project_id,history_type,message,previous_state,new_state,actor_id,orbit_event_id,correlation_id)
  values(item.asset_id,p_project_id,'OPERATION',item.asset_code||' quitada del Evento.',jsonb_build_object('assignmentId',item.id),jsonb_build_object('status','RETURNED','reason',trim(p_reason)),actor,project_row.orbit_event_id,'black-box-remove:'||item.id);
  return jsonb_build_object('removed',true,'assignmentId',item.id);
end $$;

alter table public.event_paper_snapshots enable row level security;
drop policy if exists event_paper_snapshots_master_admin_read on public.event_paper_snapshots;
create policy event_paper_snapshots_master_admin_read on public.event_paper_snapshots
  for select using(public.can_administer());
grant select on public.event_paper_snapshots to authenticated;
grant execute on function public.assign_black_box_to_event(uuid,uuid,text),public.remove_black_box_from_event(uuid,text) to authenticated;

commit;

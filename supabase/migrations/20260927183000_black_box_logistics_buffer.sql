begin;

-- A CASE needs two hours of operational hand-off time between events.
-- Keep this constant in the canonical database read/write path so callers
-- cannot accidentally reintroduce global asset-status availability.
create or replace function public.get_black_box_availability(p_project_ids uuid[])
returns table(project_id uuid, asset_id uuid, conflicts boolean)
language sql stable security definer set search_path=public as $$
  with candidate_windows as (
    select ids.project_id,w.window_start,w.window_end
    from unnest(coalesce(p_project_ids,'{}'::uuid[])) as ids(project_id)
    cross join lateral public.event_operational_window(ids.project_id) w
    where w.window_start is not null and w.window_end is not null
  )
  select c.project_id,a.id,
    exists(
      select 1
      from public.asset_assignments aa
      where aa.asset_id=a.id
        and aa.project_id<>c.project_id
        and aa.assignment_status='ASSIGNED'
        and aa.deleted_at is null
        and aa.planned_start_at is not null
        and aa.planned_end_at is not null
        and aa.planned_start_at < c.window_end + interval '2 hours'
        and aa.planned_end_at + interval '2 hours' > c.window_start
    ) as conflicts
  from candidate_windows c
  cross join public.operational_assets a
  where public.can_administer()
    and a.deleted_at is null
    and a.asset_type='CASE'
    and a.asset_code in('CASE-01','CASE-02','CASE-03','CASE-04','CASE-05','CASE-06','CASE-07','CASE-08','CASE-09');
$$;

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
  select * into current_row from public.asset_assignments aa
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
    and aa.project_id<>p_project_id and aa.planned_start_at is not null and aa.planned_end_at is not null
    and aa.planned_start_at < window_row.window_end + interval '2 hours'
    and aa.planned_end_at + interval '2 hours' > window_row.window_start) then
    raise exception 'CONFLICTO DE DISPONIBILIDAD: la Caja requiere al menos 2 horas de margen logístico entre eventos.';
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

grant execute on function public.get_black_box_availability(uuid[]) to authenticated;
grant execute on function public.assign_black_box_to_event(uuid,uuid,text) to authenticated;

commit;

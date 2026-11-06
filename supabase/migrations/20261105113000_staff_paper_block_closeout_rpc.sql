-- Per-block Staff paper closeout RPC.
-- The closeout table is provisioned separately and is intentionally not exposed
-- through the Data API. This function is the only server-side write path.
create or replace function public.record_staff_paper_block_closeout(
  p_project_id uuid,
  p_block_id uuid,
  p_operator_assignment_id uuid,
  p_opening integer,
  p_reloads integer,
  p_remaining integer,
  p_request_id uuid,
  p_staff_id uuid,
  p_portal_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row record;
  block_row record;
  asset_row record;
  previous_block_id uuid;
  previous_closeout record;
  existing_closeout record;
  closeout_id uuid;
begin
  if p_project_id is null or p_block_id is null or p_operator_assignment_id is null
     or p_request_id is null or p_staff_id is null or p_portal_session_id is null then
    raise exception 'Datos de cierre incompletos.';
  end if;
  if p_opening < 0 or p_reloads < 0 or p_remaining < 0 then
    raise exception 'El papel debe ser un entero no negativo.';
  end if;
  if p_remaining > p_opening + p_reloads then
    raise exception 'El saldo final supera el papel disponible.';
  end if;

  select b.id, b.project_id, b.name, b.sequence
    into block_row
    from public.event_operational_blocks b
   where b.id = p_block_id and b.project_id = p_project_id
   for update;
  if not found then raise exception 'Bloque operacional no encontrado.'; end if;

  select a.id, a.staff_id, a.block_id, a.assignment_type, a.status
    into assignment_row
    from public.assignments a
   where a.id = p_operator_assignment_id
     and a.project_id = p_project_id
     and a.block_id = p_block_id
     and a.staff_id = p_staff_id
     and a.assignment_type = 'OPERATOR'
     and a.status in ('CONFIRMED','ACCEPTED','COMPLETED')
     and a.deleted_at is null
   for update;
  if not found then raise exception 'La asignación no pertenece a este operador, evento y bloque.'; end if;

  select aa.id, aa.asset_id, aa.block_id, aa.assignment_status, oa.asset_code, oa.asset_type
    into asset_row
    from public.asset_assignments aa
    join public.operational_assets oa on oa.id = aa.asset_id
   where aa.project_id = p_project_id
     and aa.block_id = p_block_id
     and aa.assignment_status = 'ASSIGNED'
     and aa.deleted_at is null
     and oa.deleted_at is null
     and oa.asset_type in ('CASE','BOX')
   for update;
  if not found then raise exception 'No existe una Caja asignada a este bloque.'; end if;

  select c.* into existing_closeout
    from public.event_box_paper_block_closeouts c
   where c.project_id = p_project_id
     and c.asset_id = asset_row.asset_id
     and c.block_id = p_block_id
   for update;
  if found then
    if existing_closeout.request_id = p_request_id
       and existing_closeout.operator_assignment_id = p_operator_assignment_id
       and existing_closeout.opening = p_opening
       and existing_closeout.reloads = p_reloads
       and existing_closeout.remaining = p_remaining then
      return jsonb_build_object('closeout_id', existing_closeout.id, 'duplicate', true, 'used', existing_closeout.used, 'status', 'CLOSED');
    end if;
    raise exception 'Este cierre de Caja y bloque ya existe con otros datos.';
  end if;

  select b.id into previous_block_id
    from public.event_operational_blocks b
   where b.project_id = p_project_id and b.sequence < block_row.sequence
   order by b.sequence desc limit 1;
  if previous_block_id is not null then
    select c.* into previous_closeout
      from public.event_box_paper_block_closeouts c
     where c.project_id = p_project_id
       and c.asset_id = asset_row.asset_id
       and c.block_id = previous_block_id
     for update;
    if not found then raise exception 'Debe cerrarse el bloque anterior antes de cerrar este bloque.'; end if;
    if previous_closeout.remaining <> p_opening then
      raise exception 'El papel inicial no coincide con el saldo final del bloque anterior.';
    end if;
  end if;

  insert into public.event_box_paper_block_closeouts(
    project_id, asset_id, block_id, operator_assignment_id,
    opening, reloads, remaining, request_id, closed_by
  ) values (
    p_project_id, asset_row.asset_id, p_block_id, p_operator_assignment_id,
    p_opening, p_reloads, p_remaining, p_request_id, p_staff_id
  ) returning id into closeout_id;

  return jsonb_build_object(
    'closeout_id', closeout_id,
    'duplicate', false,
    'box_code', asset_row.asset_code,
    'block_id', p_block_id,
    'opening', p_opening,
    'reloads', p_reloads,
    'remaining', p_remaining,
    'used', p_opening + p_reloads - p_remaining,
    'status', 'CLOSED'
  );
exception when unique_violation then
  select c.* into existing_closeout
    from public.event_box_paper_block_closeouts c
   where c.request_id = p_request_id;
  if found then
    return jsonb_build_object('closeout_id', existing_closeout.id, 'duplicate', true, 'used', existing_closeout.used, 'status', 'CLOSED');
  end if;
  raise;
end;
$$;

revoke all on function public.record_staff_paper_block_closeout(uuid,uuid,uuid,integer,integer,integer,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.record_staff_paper_block_closeout(uuid,uuid,uuid,integer,integer,integer,uuid,uuid,uuid) to service_role;

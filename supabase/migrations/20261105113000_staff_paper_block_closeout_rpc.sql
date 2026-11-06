-- Per-block Staff paper closeout RPC.
-- The closeout table is provisioned separately and is intentionally not exposed
-- through the Data API. This function is the only server-side write path.
alter table public.event_box_paper_block_closeouts
  add column if not exists inventory_reconciled_at timestamptz,
  add column if not exists inventory_movement_id uuid;
create unique index if not exists paper_block_inventory_once_idx
  on public.event_box_paper_block_closeouts(project_id, asset_id)
  where inventory_reconciled_at is not null;

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
  previous_closeout_id uuid;
  final_block boolean := false;
  total_available integer;
  total_used integer;
  movement_id uuid;
  lot_row record;
  project_row record;
  final_asset_id uuid;
  final_opening integer;
  final_reloads integer;
  final_remaining integer;
  orbit_event_id text;
  customer_id uuid;
  snapshot_row record;
  snapshot_reload_total integer := 0;
  asset_version integer;
  current_stock integer;
  inventory_key text := 'staff-paper-block:' || p_project_id::text || ':';
begin
  if p_project_id is null or p_block_id is null or p_operator_assignment_id is null
     or p_request_id is null or p_staff_id is null or p_portal_session_id is null then
    raise exception 'Datos de cierre incompletos.';
  end if;
  if p_opening is null or p_reloads is null or p_remaining is null or p_opening < 0 or p_reloads < 0 or p_remaining < 0 then
    raise exception 'El papel debe ser un entero no negativo.';
  end if;
  if p_opening::bigint + p_reloads::bigint > 2147483647 then
    raise exception 'Cantidad de papel fuera del rango permitido.';
  end if;
  if p_remaining::bigint > p_opening::bigint + p_reloads::bigint then
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

  -- Resolve the exact box from the canonical event layout, never from an
  -- arbitrary asset assignment shared by multiple operators in the same block.
  select oa.id as asset_id, oa.asset_code, oa.asset_type
    into strict asset_row
    from public.projects p
    cross join lateral jsonb_array_elements(coalesce(p.operations->'totemLayout'->'positions', '[]'::jsonb)) pos(value)
    cross join lateral jsonb_array_elements(coalesce(pos.value->'blocks', '[]'::jsonb)) shift(value)
    join public.operational_assets oa on oa.id = (pos.value->>'assetId')::uuid
   where p.id = p_project_id
     and shift.value->>'blockId' = p_block_id::text
     and shift.value->>'assignmentId' = p_operator_assignment_id::text
     and oa.deleted_at is null
     and oa.asset_type in ('CASE','BOX');
  -- STRICT rejects zero or multiple matching positions, failing closed.

  select s.id, s.opening_balance
    into snapshot_row
    from public.event_paper_snapshots s
   where s.project_id = p_project_id
     and s.box_asset_id = asset_row.asset_id
   order by s.created_at asc
   limit 1
   for update;
  if not found then raise exception 'No existe snapshot canónico de papel para esta Caja.'; end if;
  select coalesce(sum(r.quantity), 0)::integer into snapshot_reload_total
    from public.event_paper_reloads r
   where r.snapshot_id = snapshot_row.id;

  select c.* into existing_closeout
    from public.event_box_paper_block_closeouts c
   where c.project_id = p_project_id
     and c.asset_id = asset_row.asset_id
     and c.block_id = p_block_id
   for update;
  if found then
    if existing_closeout.request_id = p_request_id
       and existing_closeout.closed_by = p_staff_id
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
    if p_reloads <> 0 then
      raise exception 'Las recargas del bloque PM deben registrarse en AM antes del relevo.';
    end if;
    previous_closeout_id := previous_closeout.id;
  elsif p_opening <> snapshot_row.opening_balance::integer or p_reloads <> snapshot_reload_total then
    raise exception 'El cierre AM no coincide con el snapshot y las recargas registradas.';
  end if;

  select not exists(
    select 1 from public.event_operational_blocks later
     where later.project_id = p_project_id and later.sequence > block_row.sequence
  ) into final_block;

  insert into public.event_box_paper_block_closeouts(
    project_id, asset_id, block_id, operator_assignment_id,
    opening, reloads, remaining, request_id, closed_by
  ) values (
    p_project_id, asset_row.asset_id, p_block_id, p_operator_assignment_id,
    p_opening, p_reloads, p_remaining, p_request_id, p_staff_id
  ) returning id into closeout_id;

  -- Inventory is reconciled only after the last block has closed. The row
  -- lock and stable key make the operation safe under retries/concurrency.
  if final_block and previous_closeout_id is not null then
    select c.asset_id, c.opening, c.reloads, c.remaining
      into final_asset_id, final_opening, final_reloads, final_remaining
      from public.event_box_paper_block_closeouts c
     where c.id = closeout_id
     for update;

    select c.opening, c.reloads, c.remaining, c.used
      into previous_closeout
      from public.event_box_paper_block_closeouts c
     where c.id = previous_closeout_id
     for update;
    total_available := previous_closeout.opening + previous_closeout.reloads + final_reloads;
    total_used := total_available - final_remaining;

    select p.orbit_event_id, p.customer_id into orbit_event_id, customer_id
      from public.projects p where p.id = p_project_id;

    select l.* into lot_row
      from public.box_media_lots l
     where l.box_asset_id = final_asset_id and l.status <> 'DISCARDED'
     order by l.loaded_at desc limit 1
     for update;
    if found then
      if lot_row.remaining_photo_capacity <> total_available then
        raise exception 'El saldo maestro de la Caja cambió fuera de los cierres AM/PM.';
      end if;
      inventory_key := inventory_key || final_asset_id::text;
      select im.id into movement_id from public.inventory_movements im
       where im.idempotency_key = inventory_key and im.movement_type = 'EVENT_USAGE'
       for update;
      if not found and total_used > 0 then
        insert into public.inventory_movements(
          supply_id,customer_id,project_id,orbit_event_id,staff_id,movement_type,
          quantity,occurred_at,reason,box_asset_id,printer_asset_id,media_lot_id,
          format_key,lot,quantity_before,quantity_delta,quantity_after,idempotency_key
        ) values(
          lot_row.supply_id,customer_id,p_project_id,orbit_event_id,
          p_staff_id,'EVENT_USAGE',-total_used,now(),
          'Consumo de papel conciliado AM/PM',lot_row.box_asset_id,lot_row.printer_asset_id,
          lot_row.id,lot_row.format_key,lot_row.lot,lot_row.remaining_photo_capacity,
          -total_used,final_remaining,inventory_key
        ) returning id into movement_id;
      end if;
    else
      select a.version, coalesce((a.metadata->>'blackBoxPhotoStock')::integer, total_available)
        into asset_version, current_stock
        from public.operational_assets a
       where a.id = final_asset_id and a.deleted_at is null
       for update;
      if current_stock <> total_available then
        raise exception 'El stock maestro de la Caja cambió fuera de los cierres AM/PM.';
      end if;
      update public.operational_assets
         set metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{blackBoxPhotoStock}', to_jsonb(final_remaining), true),
             version = version + 1
       where id = final_asset_id and version = asset_version;
      if not found then raise exception 'Conflicto de versión al conciliar el stock de la Caja.'; end if;
    end if;
    update public.event_box_paper_block_closeouts
       set inventory_reconciled_at = now(), inventory_movement_id = movement_id
     where id = closeout_id and inventory_reconciled_at is null;
  end if;

  return jsonb_build_object(
    'closeout_id', closeout_id,
    'duplicate', false,
    'box_code', asset_row.asset_code,
    'block_id', p_block_id,
    'opening', p_opening,
    'reloads', p_reloads,
    'remaining', p_remaining,
    'used', p_opening + p_reloads - p_remaining,
    'inventory_reconciled', final_block and previous_closeout_id is not null,
    'inventory_movement_id', movement_id,
    'status', 'CLOSED'
  );
exception when unique_violation then
  select c.* into existing_closeout
    from public.event_box_paper_block_closeouts c
   where c.request_id = p_request_id;
  if found then
    if existing_closeout.project_id = p_project_id
       and existing_closeout.block_id = p_block_id
       and existing_closeout.operator_assignment_id = p_operator_assignment_id
       and existing_closeout.closed_by = p_staff_id
       and existing_closeout.opening = p_opening
       and existing_closeout.reloads = p_reloads
       and existing_closeout.remaining = p_remaining then
      return jsonb_build_object('closeout_id', existing_closeout.id, 'duplicate', true, 'used', existing_closeout.used, 'status', 'CLOSED');
    end if;
    raise exception 'Solicitud duplicada con datos diferentes.';
  end if;
  raise;
end;
$$;

revoke all on function public.record_staff_paper_block_closeout(uuid,uuid,uuid,integer,integer,integer,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.record_staff_paper_block_closeout(uuid,uuid,uuid,integer,integer,integer,uuid,uuid,uuid) to service_role;

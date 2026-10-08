begin;

-- Founder/Admin closeout for events where the operator cannot complete the
-- paper return. It reuses event_paper_snapshots and inventory_movements; it
-- never creates a second stock ledger.
create or replace function public.admin_force_staff_event_paper_closeout(
  p_project_id uuid,
  p_asset_assignment_id uuid,
  p_final_remaining numeric,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  snapshot_row public.event_paper_snapshots%rowtype;
  assignment_row record;
  asset_row public.operational_assets%rowtype;
  lot_row public.box_media_lots%rowtype;
  project_row record;
  reload_total numeric := 0;
  expected_balance numeric;
  previous_usage numeric := 0;
  new_usage numeric;
  delta_usage numeric;
  current_stock numeric;
  next_stock numeric;
  movement_id uuid;
  master_version_after integer;
  correlation text := 'staff-paper-admin-close:' || nullif(trim(p_idempotency_key), '');
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede forzar el cierre de papel.' using errcode = '42501';
  end if;
  if p_project_id is null or p_asset_assignment_id is null then
    raise exception 'Evento y asignación de Caja son obligatorios.' using errcode = '22023';
  end if;
  if p_final_remaining is null or p_final_remaining < 0 or p_final_remaining <> trunc(p_final_remaining) then
    raise exception 'El saldo final debe ser un entero no negativo.' using errcode = '22023';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) < 3 then
    raise exception 'El motivo del cierre administrativo es obligatorio.' using errcode = '22023';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria.' using errcode = '22023';
  end if;

  if exists (select 1 from public.timeline_events where correlation_id = correlation) then
    return jsonb_build_object('duplicate', true, 'idempotency_key', p_idempotency_key);
  end if;

  select * into snapshot_row
  from public.event_paper_snapshots
  where project_id = p_project_id and asset_assignment_id = p_asset_assignment_id
  for update;
  if not found or not snapshot_row.paper_required then
    raise exception 'Este evento no tiene una carga de papel válida.' using errcode = 'P0002';
  end if;

  select aa.id, aa.asset_id, aa.assignment_status, aa.deleted_at, a.asset_code, a.asset_type
    into assignment_row
  from public.asset_assignments aa
  join public.operational_assets a on a.id = aa.asset_id
  where aa.id = p_asset_assignment_id and aa.project_id = p_project_id and aa.deleted_at is null
  for update of aa;
  if not found or assignment_row.asset_id is distinct from snapshot_row.box_asset_id then
    raise exception 'La Caja activa no coincide con el snapshot del evento.' using errcode = '23514';
  end if;

  select * into asset_row from public.operational_assets where id = assignment_row.asset_id for update;
  if asset_row.asset_type not in ('CASE', 'BOX') then
    raise exception 'La asignación no corresponde a una Caja Negra.' using errcode = '23514';
  end if;

  if snapshot_row.media_lot_id is not null then
    select * into lot_row from public.box_media_lots
    where id = snapshot_row.media_lot_id and status <> 'DISCARDED' for update;
    if not found then raise exception 'Lote de papel no disponible.' using errcode = '23503'; end if;
    select coalesce(sum(quantity), 0) into reload_total
    from public.event_paper_reloads where snapshot_id = snapshot_row.id;
  end if;
  expected_balance := snapshot_row.opening_balance + reload_total;
  previous_usage := coalesce(snapshot_row.event_usage, 0);
  current_stock := coalesce((asset_row.metadata ->> 'blackBoxPhotoStock')::numeric, expected_balance - previous_usage);
  if current_stock <> expected_balance - previous_usage then
    raise exception 'El stock Master cambió fuera de este evento. Revisión requerida.' using errcode = '40001';
  end if;
  new_usage := expected_balance - p_final_remaining;
  if new_usage < 0 or new_usage > expected_balance then
    raise exception 'El consumo calculado está fuera de los límites del snapshot.' using errcode = '22023';
  end if;
  delta_usage := new_usage - previous_usage;
  next_stock := current_stock - delta_usage;
  if next_stock < 0 then
    raise exception 'El cierre produciría un saldo Master negativo.' using errcode = '23514';
  end if;

  if delta_usage <> 0 and snapshot_row.media_lot_id is not null then
    insert into public.inventory_movements(
      supply_id, project_id, orbit_event_id, movement_type, quantity, occurred_at, reason,
      created_by, updated_by, box_asset_id, printer_asset_id, media_lot_id, format_key, lot,
      quantity_before, quantity_delta, quantity_after, idempotency_key
    )
    values(
      lot_row.supply_id, p_project_id, (select orbit_event_id from public.projects where id = p_project_id),
      'EVENT_USAGE', -delta_usage, now(), 'Cierre administrativo de papel: ' || trim(p_reason),
      actor, actor, lot_row.box_asset_id, lot_row.printer_asset_id, lot_row.id, lot_row.format_key, lot_row.lot,
      current_stock, -delta_usage, next_stock, correlation
    ) returning id into movement_id;
  end if;

  update public.operational_assets
  set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{blackBoxPhotoStock}', to_jsonb(next_stock), true),
      updated_by = actor
  where id = asset_row.id and version = asset_row.version
    and coalesce((metadata ->> 'blackBoxPhotoStock')::numeric, expected_balance - previous_usage) = current_stock
  returning version into master_version_after;
  if master_version_after is null then
    raise exception 'Conflicto de versión del stock Master. Revisión requerida.' using errcode = '40001';
  end if;

  select p.id, p.customer_id, p.orbit_event_id into project_row
  from public.projects p where p.id = p_project_id;

  update public.event_paper_snapshots
  set status = 'OVERRIDDEN', final_remaining_balance = p_final_remaining, event_usage = new_usage,
      overridden_by = actor, overridden_at = now(), confirmed_at = coalesce(confirmed_at, now()),
      close_note = trim(p_reason), master_asset_version_before = asset_row.version,
      master_asset_version_after = master_version_after, master_stock_before = current_stock,
      master_stock_after = next_stock
  where id = snapshot_row.id;

  insert into public.audit_events(entity_type, entity_id, action, actor_id, reason, previous_state, new_state, orbit_event_id)
  values('EVENT_PAPER_CLOSEOUT', snapshot_row.id::text, 'ADMIN_CLOSED', actor, trim(p_reason),
    jsonb_build_object('eventId', p_project_id, 'assetId', asset_row.id, 'initial', expected_balance, 'previousUsage', previous_usage, 'previousStock', current_stock),
    jsonb_build_object('eventId', p_project_id, 'assetId', asset_row.id, 'final', p_final_remaining, 'consumption', new_usage, 'stock', next_stock, 'closedBy', actor, 'closedAt', now()),
    project_row.orbit_event_id);
  insert into public.timeline_events(
    customer_id, project_id, staff_id, orbit_event_id, event_type, title, description,
    actor_label, source, action, entity_type, entity_id, human_message, correlation_id, reason
  )
  values(
    project_row.customer_id, p_project_id, null, project_row.orbit_event_id, 'STAFF_PAPER_ADMIN_CLOSEOUT',
    'Cierre administrativo de papel',
    format('Caja %s · inicial %s · final %s · consumido %s', assignment_row.asset_code, expected_balance, p_final_remaining, new_usage),
    'Administrador', 'Administrator', 'STAFF_PAPER_ADMIN_CLOSEOUT', 'EventPaperSnapshot', snapshot_row.id,
    'El administrador cerró el consumo de papel del evento.', correlation, trim(p_reason)
  );

  return jsonb_build_object(
    'duplicate', false, 'snapshot_id', snapshot_row.id, 'status', 'OVERRIDDEN',
    'opening_balance', expected_balance, 'previous_usage', previous_usage,
    'final_remaining', p_final_remaining, 'event_usage', new_usage,
    'master_stock_before', current_stock, 'master_stock_after', next_stock,
    'movement_id', movement_id
  );
end;
$$;

revoke all on function public.admin_force_staff_event_paper_closeout(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.admin_force_staff_event_paper_closeout(uuid,uuid,numeric,text,text) to authenticated;

commit;

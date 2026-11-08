begin;

-- Legacy CASE inventory has no media lot or supply row. Permit an asset-scoped
-- EVENT_USAGE movement while preserving supply-backed requirements elsewhere.
alter table public.inventory_movements alter column supply_id drop not null;
alter table public.inventory_movements
  drop constraint if exists inventory_movements_legacy_case_usage_check;
alter table public.inventory_movements
  add constraint inventory_movements_legacy_case_usage_check check (
    supply_id is not null
    or (
      movement_type = 'EVENT_USAGE'
      and media_lot_id is null
      and box_asset_id is not null
      and project_id is not null
    )
  );

-- The canonical inventory timeline trigger historically required a supply
-- reference. Legacy CASE stock has no media lot/supply; audit that movement by
-- its box asset while keeping all supply-backed timeline rows unchanged.
create or replace function public.record_inventory_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  movement_label text;
  timeline_type text;
  timeline_action text;
  timeline_entity_type text;
  timeline_entity_id text;
begin
  if new.project_id is null then return new; end if;

  movement_label := case new.movement_type
    when 'PURCHASE' then 'Compra de insumo registrada.'
    when 'CONSUMPTION' then 'Consumo de insumo registrado.'
    when 'ADJUSTMENT' then 'Inventario de insumo ajustado.'
    when 'LOSS' then 'Pérdida de insumo registrada.'
    when 'REPLACEMENT' then 'Reemplazo de insumo registrado.'
    when 'LOAD' then 'Media cargada en caja.'
    when 'EVENT_USAGE' then 'Consumo de media durante evento.'
    when 'MANUAL_ADJUSTMENT' then 'Ajuste manual de media registrado.'
    when 'RETURN' then 'Saldo de media registrado al retorno.'
    else 'Media descartada.'
  end;

  if new.supply_id is null then
    if new.movement_type <> 'EVENT_USAGE' or new.box_asset_id is null then
      raise exception 'Movimiento sin insumo requiere consumo de evento asociado a Caja.' using errcode = '23514';
    end if;
    timeline_type := 'BOX_' || new.movement_type;
    timeline_action := 'BOX_' || new.movement_type;
    timeline_entity_type := 'OperationalAsset';
    timeline_entity_id := new.box_asset_id::text;
    movement_label := 'Consumo de papel de Caja durante evento.';
  else
    timeline_type := 'SUPPLY_' || new.movement_type;
    timeline_action := timeline_type;
    timeline_entity_type := 'Supply';
    timeline_entity_id := new.supply_id::text;
  end if;

  insert into public.timeline_events(
    customer_id,project_id,event_type,title,description,reason,occurred_at,created_by,
    orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id
  )
  values(
    new.customer_id,new.project_id,timeline_type,movement_label,movement_label,new.reason,
    new.occurred_at,new.created_by,coalesce(new.orbit_event_id,'SUPPLY-'||new.id::text),
    new.created_by,'Operaciones','Operations',timeline_action,timeline_entity_type,timeline_entity_id,
    movement_label,'inventory-'||new.id::text
  );
  return new;
end
$function$;

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
  reported_operator_id uuid;
  reported_operator_count integer := 0;
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
    raise exception 'Solo Founder o Administración puede confirmar el cierre administrativo de papel.' using errcode = '42501';
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

  -- Serialize identical retries before checking the timeline and locking stock.
  perform pg_advisory_xact_lock(hashtextextended(correlation, 0));

  select * into snapshot_row
  from public.event_paper_snapshots
  where project_id = p_project_id and asset_assignment_id = p_asset_assignment_id
  for update;
  if not found or not snapshot_row.paper_required then
    raise exception 'Este evento no tiene una carga de papel válida.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.timeline_events where correlation_id = correlation) then
    return jsonb_build_object(
      'duplicate', true, 'snapshot_id', snapshot_row.id, 'status', snapshot_row.status,
      'final_remaining', snapshot_row.final_remaining_balance, 'event_usage', snapshot_row.event_usage,
      'idempotency_key', p_idempotency_key
    );
  end if;
  if snapshot_row.status not in ('PENDING','READY_TO_CLOSE')
     or snapshot_row.final_remaining_balance is not null then
    raise exception 'El snapshot ya fue cerrado con otra solicitud. No se aplicó otro descuento.' using errcode = '23514';
  end if;

  select aa.id, aa.asset_id, aa.assignment_status, aa.deleted_at, a.asset_code, a.asset_type
    into assignment_row
  from public.asset_assignments aa
  join public.operational_assets a on a.id = aa.asset_id
  where aa.id = p_asset_assignment_id and aa.project_id = p_project_id and aa.deleted_at is null
  for update of aa;
  if not found or assignment_row.asset_id is distinct from snapshot_row.box_asset_id
     or assignment_row.assignment_status <> 'ASSIGNED' then
    raise exception 'La Caja activa no coincide con el snapshot del evento.' using errcode = '23514';
  end if;

  select * into asset_row from public.operational_assets where id = assignment_row.asset_id for update;
  if asset_row.asset_type not in ('CASE', 'BOX') then
    raise exception 'La asignación no corresponde a una Caja.' using errcode = '23514';
  end if;

  if snapshot_row.media_lot_id is not null then
    select * into lot_row from public.box_media_lots
    where id = snapshot_row.media_lot_id and status <> 'DISCARDED' for update;
    if not found then raise exception 'Lote de papel no disponible.' using errcode = '23503'; end if;
  end if;
  select coalesce(sum(quantity), 0) into reload_total
  from public.event_paper_reloads where snapshot_id = snapshot_row.id;

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

  select p.id, p.customer_id, p.orbit_event_id into project_row
  from public.projects p where p.id = p_project_id for share;
  if not found then raise exception 'Evento inexistente.' using errcode = 'P0002'; end if;

  -- Link the report to the unique assigned operator when unambiguous. This
  -- records source attribution only; the administrator remains the closer.
  select count(distinct a.staff_id), (array_agg(distinct a.staff_id))[1]
    into reported_operator_count, reported_operator_id
  from public.assignments a
  where a.project_id = p_project_id
    and a.assignment_type = 'OPERATOR'
    and a.staff_id is not null;
  if reported_operator_count <> 1 then
    reported_operator_id := null;
  end if;

  if delta_usage > 0 then
    insert into public.inventory_movements(
      supply_id, customer_id, project_id, orbit_event_id, staff_id, movement_type, quantity, occurred_at, reason,
      created_by, updated_by, box_asset_id, printer_asset_id, media_lot_id, format_key, lot,
      quantity_before, quantity_delta, quantity_after, idempotency_key
    )
    values(
      case when snapshot_row.media_lot_id is null then null else lot_row.supply_id end,
      project_row.customer_id, p_project_id, project_row.orbit_event_id, reported_operator_id,
      'EVENT_USAGE', -delta_usage, now(),
      'Cierre administrativo de papel; reporte operador preservado. ' || trim(p_reason),
      actor, actor, asset_row.id, snapshot_row.printer_asset_id, snapshot_row.media_lot_id,
      snapshot_row.format_key, snapshot_row.lot, current_stock, -delta_usage, next_stock, correlation
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

  update public.event_paper_snapshots
  set status = 'OVERRIDDEN', final_remaining_balance = p_final_remaining, event_usage = new_usage,
      overridden_by = actor, overridden_at = now(),
      override_reason = trim(p_reason),
      master_asset_version_before = asset_row.version,
      master_asset_version_after = master_version_after,
      master_stock_before = current_stock, master_stock_after = next_stock
  where id = snapshot_row.id;

  insert into public.audit_events(entity_type, entity_id, action, actor_id, reason, previous_state, new_state, orbit_event_id)
  values(
    'EVENT_PAPER_CLOSEOUT', snapshot_row.id::text, 'ADMIN_CLOSED', actor, trim(p_reason),
    jsonb_build_object('eventId', p_project_id, 'assetId', asset_row.id, 'initial', expected_balance,
      'previousUsage', previous_usage, 'previousStock', current_stock, 'operatorReport', snapshot_row.close_note,
      'confirmedByBefore', snapshot_row.confirmed_by),
    jsonb_build_object('eventId', p_project_id, 'assetId', asset_row.id, 'final', p_final_remaining,
      'consumption', new_usage, 'stock', next_stock, 'closedBy', actor, 'closedAt', now(),
      'operatorReport', snapshot_row.close_note, 'reportedOperatorStaffId', reported_operator_id, 'operatorConfirmationFabricated', false),
    project_row.orbit_event_id
  );
  insert into public.timeline_events(
    customer_id, project_id, staff_id, orbit_event_id, event_type, title, description,
    actor_label, actor_id, source, action, entity_type, entity_id, human_message, correlation_id, reason
  )
  values(
    project_row.customer_id, p_project_id, reported_operator_id, project_row.orbit_event_id, 'STAFF_PAPER_ADMIN_CLOSEOUT',
    'Cierre administrativo de papel',
    format('Caja %s · inicial %s · final %s · consumido %s · reporte operador conservado (asignación fuente %s)',
      assignment_row.asset_code, expected_balance, p_final_remaining, new_usage, coalesce(reported_operator_id::text, 'sin operador único')),
    'Administrador', actor, 'Administrator', 'STAFF_PAPER_ADMIN_CLOSEOUT', 'EventPaperSnapshot', snapshot_row.id,
    'Se confirmó administrativamente el cierre de papel. La asignación de Caja no fue liberada.',
    correlation, trim(p_reason)
  );

  return jsonb_build_object(
    'duplicate', false, 'snapshot_id', snapshot_row.id, 'status', 'OVERRIDDEN',
    'opening_balance', expected_balance, 'previous_usage', previous_usage,
    'final_remaining', p_final_remaining, 'event_usage', new_usage,
    'master_stock_before', current_stock, 'master_stock_after', next_stock,
    'movement_id', movement_id, 'assignment_preserved', true,
    'operator_report_preserved', true, 'confirmed_by', snapshot_row.confirmed_by
  );
end;
$$;

revoke all on function public.admin_force_staff_event_paper_closeout(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.admin_force_staff_event_paper_closeout(uuid,uuid,numeric,text,text) to authenticated;

create or replace function public.sync_box_master_and_future_events_after_paper_close()
returns trigger
language plpgsql
security definer
set search_path to public
as $function$
declare
  future_row record;
  current_project record;
begin
  if new.status not in ('CONFIRMED','OVERRIDDEN')
     or new.final_remaining_balance is null
     or new.box_asset_id is null then
    return new;
  end if;
  if old.status in ('CONFIRMED','OVERRIDDEN')
     and old.final_remaining_balance is not distinct from new.final_remaining_balance then
    return new;
  end if;

  -- Only an operator-confirmed operational return releases an assignment.
  -- Administrative paper closeout changes paper state only.
  if new.status = 'CONFIRMED' then
    update public.asset_assignments
    set assignment_status = 'RETURNED',
        returned_at = coalesce(returned_at, now()),
        return_condition = coalesce(return_condition, 'OK'),
        return_notes = coalesce(nullif(return_notes,''), 'Retorno al confirmar cierre de papel.'),
        updated_at = now()
    where id = new.asset_assignment_id
      and assignment_status = 'ASSIGNED' and deleted_at is null;

    update public.operational_assets
    set status = 'AVAILABLE'
    where id = new.box_asset_id
      and status not in ('MAINTENANCE','OUT_OF_SERVICE')
      and not exists (
        select 1 from public.asset_assignments aa
        where aa.asset_id = new.box_asset_id and aa.id <> new.asset_assignment_id
          and aa.assignment_status = 'ASSIGNED' and aa.deleted_at is null
          and aa.planned_start_at is not null and aa.planned_end_at is not null
          and aa.planned_start_at <= now() and aa.planned_end_at > now()
      );
  end if;

  select id,event_date,event_time into current_project
  from public.projects where id = new.project_id;

  for future_row in
    select eps.project_id, eps.asset_assignment_id
    from public.event_paper_snapshots eps
    join public.projects p on p.id = eps.project_id
    where eps.box_asset_id = new.box_asset_id
      and eps.id <> new.id and eps.status = 'PENDING'
      and eps.final_remaining_balance is null and eps.event_usage is null
      and (
        p.event_date > current_project.event_date
        or (p.event_date = current_project.event_date
          and coalesce(p.event_time,'00:00:00'::time) > coalesce(current_project.event_time,'00:00:00'::time))
      )
    order by p.event_date, p.event_time nulls last
  loop
    perform public.rebase_pending_event_paper_snapshot(future_row.project_id, future_row.asset_assignment_id);
  end loop;
  return new;
end
$function$;

commit;

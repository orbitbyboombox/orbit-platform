begin;

alter function public.admin_force_staff_event_paper_closeout(uuid,uuid,numeric,text,text)
  rename to admin_force_staff_event_paper_closeout_v1;

revoke all on function public.admin_force_staff_event_paper_closeout_v1(uuid,uuid,numeric,text,text)
  from public, anon, authenticated;

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
    when 'EVENT_USAGE' then
      case when new.quantity > 0 then 'Rectificación del consumo de papel de Caja.'
           else 'Consumo de media durante evento.' end
    when 'MANUAL_ADJUSTMENT' then 'Ajuste manual de media registrado.'
    when 'RETURN' then 'Saldo de media registrado al retorno.'
    else 'Media descartada.'
  end;

  if new.supply_id is null then
    if new.movement_type <> 'EVENT_USAGE' or new.box_asset_id is null then
      raise exception 'Movimiento sin insumo requiere consumo de evento asociado a Caja.' using errcode = '23514';
    end if;
    timeline_type := case when new.quantity > 0 then 'BOX_EVENT_USAGE_CORRECTION' else 'BOX_EVENT_USAGE' end;
    timeline_action := timeline_type;
    timeline_entity_type := 'OperationalAsset';
    timeline_entity_id := new.box_asset_id::text;
    movement_label := case when new.quantity > 0
      then 'Rectificación del consumo de papel de Caja.'
      else 'Consumo de papel de Caja durante evento.' end;
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
as $function$
declare
  actor uuid := auth.uid();
  snapshot_row public.event_paper_snapshots%rowtype;
  assignment_row record;
  asset_row public.operational_assets%rowtype;
  project_row record;
  reload_total numeric := 0;
  expected_balance numeric;
  previous_usage numeric := 0;
  previous_final numeric;
  new_usage numeric;
  movement_delta numeric;
  current_stock numeric;
  next_stock numeric;
  movement_id uuid;
  master_version_after integer;
  original_movement_count integer := 0;
  net_usage_movement numeric := 0;
  correction_sequence integer := 0;
  correction_correlation text;
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

  perform pg_advisory_xact_lock(hashtextextended(correlation, 0));

  select * into snapshot_row
    from public.event_paper_snapshots
   where project_id = p_project_id
     and asset_assignment_id = p_asset_assignment_id
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

  select aa.id, aa.asset_id, aa.assignment_status, aa.deleted_at, a.asset_code, a.asset_type
    into assignment_row
    from public.asset_assignments aa
    join public.operational_assets a on a.id = aa.asset_id
   where aa.id = p_asset_assignment_id
     and aa.project_id = p_project_id
     and aa.deleted_at is null
   for update of aa;
  if not found or assignment_row.asset_id is distinct from snapshot_row.box_asset_id
     or assignment_row.assignment_status <> 'ASSIGNED' then
    raise exception 'La Caja activa no coincide con el snapshot del evento.' using errcode = '23514';
  end if;

  select * into asset_row
    from public.operational_assets
   where id = assignment_row.asset_id
   for update;
  if asset_row.asset_type not in ('CASE','BOX') then
    raise exception 'La asignación no corresponde a una Caja.' using errcode = '23514';
  end if;

  if snapshot_row.media_lot_id is not null then
    raise exception 'La rectificación administrativa de cierre requiere una Caja sin lote de media vinculado; revisión manual del lote requerida.' using errcode = '23514';
  end if;

  select coalesce(sum(quantity), 0) into reload_total
    from public.event_paper_reloads
   where snapshot_id = snapshot_row.id;
  expected_balance := snapshot_row.opening_balance + reload_total;

  if snapshot_row.status in ('CONFIRMED','OVERRIDDEN')
     and snapshot_row.final_remaining_balance is not null
     and snapshot_row.event_usage is not null then
    previous_final := snapshot_row.final_remaining_balance;
    previous_usage := snapshot_row.event_usage;
    new_usage := expected_balance - p_final_remaining;

    if p_final_remaining > expected_balance or new_usage < 0 then
      raise exception 'El saldo final supera el papel disponible.' using errcode = '22023';
    end if;
    if previous_final <> expected_balance - previous_usage then
      raise exception 'El cierre guardado no cuadra con inicial, recargas y consumo; se requiere revisión manual.' using errcode = '40001';
    end if;
    if previous_final = p_final_remaining then
      return jsonb_build_object(
        'duplicate', true, 'snapshot_id', snapshot_row.id, 'status', snapshot_row.status,
        'final_remaining', previous_final, 'event_usage', previous_usage,
        'no_change', true, 'idempotency_key', p_idempotency_key
      );
    end if;

    select count(*)::integer
      into original_movement_count
      from public.inventory_movements im
     where im.project_id = p_project_id
       and im.box_asset_id = assignment_row.asset_id
       and im.movement_type = 'EVENT_USAGE'
       and im.deleted_at is null
       and im.idempotency_key like
         'staff-paper-admin-close:admin-paper-close:' ||
         p_project_id::text || ':' || p_asset_assignment_id::text || ':%';

    select coalesce(sum(im.quantity),0)
      into net_usage_movement
      from public.inventory_movements im
     where im.project_id = p_project_id
       and im.box_asset_id = assignment_row.asset_id
       and im.movement_type = 'EVENT_USAGE'
       and im.deleted_at is null
       and (im.idempotency_key like 'staff-paper-admin-close:%'
            or im.idempotency_key like 'staff-paper-admin-correction:%');

    if (previous_usage > 0 and original_movement_count <> 1)
       or (previous_usage = 0 and original_movement_count > 1)
       or net_usage_movement <> -previous_usage then
      raise exception 'Los movimientos del cierre no cuadran con el snapshot; no se aplicó la rectificación.' using errcode = '40001';
    end if;

    current_stock := coalesce((asset_row.metadata ->> 'blackBoxPhotoStock')::numeric,
                              expected_balance - previous_usage);
    if current_stock not in (previous_final, p_final_remaining) then
      raise exception 'El stock Master cambió a un saldo distinto del cierre actual y el saldo rectificado. Revisión requerida.' using errcode = '40001';
    end if;

    select (count(*) + 1)::integer into correction_sequence
      from public.audit_events
     where entity_type = 'EVENT_PAPER_CLOSEOUT'
       and entity_id = snapshot_row.id::text
       and action = 'ADMIN_CORRECTED';
    correction_correlation := 'staff-paper-admin-correction:' ||
      snapshot_row.id::text || ':' || correction_sequence::text;

    if exists (select 1 from public.timeline_events where correlation_id = correction_correlation) then
      return jsonb_build_object(
        'duplicate', true, 'snapshot_id', snapshot_row.id, 'status', snapshot_row.status,
        'final_remaining', snapshot_row.final_remaining_balance, 'event_usage', snapshot_row.event_usage,
        'idempotency_key', p_idempotency_key
      );
    end if;

    movement_delta := previous_final - p_final_remaining;
    next_stock := p_final_remaining;
    if current_stock = previous_final then
      update public.operational_assets
         set metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{blackBoxPhotoStock}', to_jsonb(next_stock), true),
             updated_by = actor
       where id = asset_row.id
         and version = asset_row.version
         and coalesce((metadata ->> 'blackBoxPhotoStock')::numeric,
                      expected_balance - previous_usage) = current_stock
       returning version into master_version_after;
      if master_version_after is null then
        raise exception 'Conflicto de versión del stock Master. Revisión requerida.' using errcode = '40001';
      end if;
    else
      master_version_after := asset_row.version;
    end if;

    if movement_delta <> 0 then
      insert into public.inventory_movements(
        supply_id, customer_id, project_id, orbit_event_id, staff_id, movement_type, quantity, occurred_at, reason,
        created_by, updated_by, box_asset_id, printer_asset_id, media_lot_id, format_key, lot,
        quantity_before, quantity_delta, quantity_after, idempotency_key
      )
      select null, p.customer_id, p_project_id, p.orbit_event_id, null, 'EVENT_USAGE', movement_delta, now(),
        format('Rectificación administrativa de cierre de papel: saldo anterior %s, saldo corregido %s. %s',
               previous_final, p_final_remaining, trim(p_reason)),
        actor, actor, asset_row.id, snapshot_row.printer_asset_id, null, snapshot_row.format_key, snapshot_row.lot,
        previous_final, movement_delta, p_final_remaining, correction_correlation
        from public.projects p
       where p.id = p_project_id
      returning id into movement_id;
      if movement_id is null then raise exception 'No se pudo vincular la rectificación al evento.'; end if;
    end if;

    update public.event_paper_snapshots
       set status = 'OVERRIDDEN',
           final_remaining_balance = p_final_remaining,
           event_usage = new_usage,
           overridden_by = actor,
           overridden_at = now(),
           override_reason = concat_ws(E'\n', nullif(override_reason,''), format(
             'RECTIFICACIÓN ADMINISTRATIVA: %s → %s fotos; consumo %s → %s. Motivo: %s',
             previous_final, p_final_remaining, previous_usage, new_usage, trim(p_reason))),
           master_asset_version_before = asset_row.version,
           master_asset_version_after = master_version_after,
           master_stock_before = previous_final,
           master_stock_after = next_stock
     where id = snapshot_row.id;

    select p.id, p.customer_id, p.orbit_event_id
      into project_row
      from public.projects p
     where p.id = p_project_id;

    insert into public.audit_events(
      entity_type, entity_id, action, actor_id, reason, previous_state, new_state, orbit_event_id
    ) values (
      'EVENT_PAPER_CLOSEOUT', snapshot_row.id::text, 'ADMIN_CORRECTED', actor, trim(p_reason),
      jsonb_build_object('eventId', p_project_id, 'assetId', asset_row.id,
        'previousFinal', previous_final, 'previousConsumption', previous_usage,
        'masterStockBefore', current_stock, 'operatorReport', snapshot_row.close_note,
        'assignmentPreserved', true),
      jsonb_build_object('eventId', p_project_id, 'assetId', asset_row.id,
        'final', p_final_remaining, 'consumption', new_usage, 'stock', next_stock,
        'closedBy', actor, 'closedAt', now(), 'movementId', movement_id,
        'reportedOperatorConfirmationFabricated', false),
      project_row.orbit_event_id
    );

    insert into public.timeline_events(
      customer_id, project_id, orbit_event_id, event_type, title, description, reason,
      actor_label, actor_id, source, action, entity_type, entity_id, human_message, correlation_id
    ) values (
      project_row.customer_id, p_project_id, project_row.orbit_event_id,
      'STAFF_PAPER_ADMIN_CORRECTION', 'Rectificación administrativa de cierre de papel',
      format('Caja %s · saldo %s → %s · consumo %s → %s',
        assignment_row.asset_code, previous_final, p_final_remaining, previous_usage, new_usage),
      trim(p_reason), 'Administrador', actor, 'Administrator', 'STAFF_PAPER_ADMIN_CORRECTION',
      'EventPaperSnapshot', snapshot_row.id::text,
      'Se rectificó el cierre de papel existente con movimiento compensatorio; la asignación de Caja se conservó.',
      correction_correlation
    );

    return jsonb_build_object(
      'duplicate', false, 'corrected', true, 'snapshot_id', snapshot_row.id,
      'status', 'OVERRIDDEN', 'opening_balance', expected_balance,
      'previous_final_remaining', previous_final, 'previous_usage', previous_usage,
      'final_remaining', p_final_remaining, 'event_usage', new_usage,
      'master_stock_before', current_stock, 'master_stock_after', next_stock,
      'movement_id', movement_id, 'assignment_preserved', true,
      'operator_report_preserved', true, 'correction_sequence', correction_sequence
    );
  end if;

  return public.admin_force_staff_event_paper_closeout_v1(
    p_project_id, p_asset_assignment_id, p_final_remaining, p_reason, p_idempotency_key
  );
end
$function$;

revoke all on function public.admin_force_staff_event_paper_closeout(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.admin_force_staff_event_paper_closeout(uuid,uuid,numeric,text,text) to authenticated;

commit;
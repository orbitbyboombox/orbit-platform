create or replace function public.admin_repair_ccu_closeout_movement_sign(
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
  s public.event_paper_snapshots%rowtype;
  asset_rec record;
  original_count integer;
  wrong_count integer;
  movement_net numeric;
  wrong_delta numeric;
  repair_delta numeric;
  correction_key text;
  repair_key text;
  repair_id uuid;
  stock numeric;
  event_id uuid;
  customer_id uuid;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede reparar el ledger.' using errcode = '42501';
  end if;
  if p_project_id <> '58d8e3cc-4a6f-4b29-a444-9a5cfcb10cdb'::uuid
     or p_asset_assignment_id not in (
       '45fd9a4b-8818-4616-8294-a1ca33dfdbe4'::uuid,
       '2c6ab260-c622-477e-a7a4-f13c5a3f8923'::uuid
     ) then
    raise exception 'La reparación está limitada a las cajas 6 y 7 del evento CCU indicado.' using errcode = '42501';
  end if;

  select * into s from public.event_paper_snapshots
   where project_id=p_project_id and asset_assignment_id=p_asset_assignment_id for update;
  if not found or s.status not in ('CONFIRMED','OVERRIDDEN')
     or s.final_remaining_balance is distinct from p_final_remaining
     or s.opening_balance <> 700
     or s.media_lot_id is not null then
    raise exception 'El snapshot no coincide con los valores ya confirmados; reparación detenida.' using errcode = '40001';
  end if;

  select aa.asset_id,oa.asset_code,coalesce((oa.metadata->>'blackBoxPhotoStock')::numeric,0) stock
    into asset_rec from public.asset_assignments aa
    join public.operational_assets oa on oa.id=aa.asset_id
   where aa.id=p_asset_assignment_id and aa.project_id=p_project_id
     and aa.deleted_at is null and aa.assignment_status='ASSIGNED'
   for update of aa,oa;
  if not found or asset_rec.stock <> p_final_remaining then
    raise exception 'La Caja no conserva el saldo Master confirmado.' using errcode='40001';
  end if;
  stock := asset_rec.stock;

  if p_asset_assignment_id='45fd9a4b-8818-4616-8294-a1ca33dfdbe4'::uuid then
    if p_final_remaining<>484 or s.event_usage<>216 then raise exception 'Valores CASE-06 inesperados.' using errcode='40001'; end if;
    wrong_delta := -279; repair_delta := 558;
  else
    if p_final_remaining<>519 or s.event_usage<>181 then raise exception 'Valores CASE-07 inesperados.' using errcode='40001'; end if;
    wrong_delta := -342; repair_delta := 684;
  end if;

  correction_key := 'staff-paper-admin-correction:'||s.id::text||':1';
  repair_key := 'staff-paper-admin-correction-repair:'||s.id::text;
  select count(*)::int,coalesce(sum(quantity),0) into original_count,movement_net
   from public.inventory_movements
   where project_id=p_project_id and box_asset_id=asset_rec.asset_id
     and movement_type='EVENT_USAGE' and deleted_at is null
     and (idempotency_key like 'staff-paper-admin-close:%'
       or idempotency_key like 'staff-paper-admin-correction:%');
  select count(*)::int into wrong_count from public.inventory_movements
   where project_id=p_project_id and box_asset_id=asset_rec.asset_id
     and movement_type='EVENT_USAGE' and deleted_at is null
     and idempotency_key=correction_key and quantity=wrong_delta;
  if original_count<>2 or wrong_count<>1 or movement_net<>-(s.event_usage+2*abs(wrong_delta)) then
    raise exception 'El patrón del ledger no coincide exactamente con el error detectado; reparación detenida.' using errcode='40001';
  end if;
  if exists(select 1 from public.inventory_movements where idempotency_key=repair_key) then
    return jsonb_build_object('duplicate',true,'snapshot_id',s.id,'final_remaining',s.final_remaining_balance);
  end if;

  select p.orbit_event_id,p.customer_id into event_id,customer_id from public.projects p where p.id=p_project_id;
  insert into public.inventory_movements(
    supply_id,customer_id,project_id,orbit_event_id,staff_id,movement_type,quantity,occurred_at,reason,
    created_by,updated_by,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,
    quantity_before,quantity_delta,quantity_after,idempotency_key
  ) values (
    null,customer_id,p_project_id,event_id,null,'EVENT_USAGE',repair_delta,now(),
    'Compensación administrativa del error de signo en una rectificación previa. Saldo final ya confirmado; no vuelve a descontar Master.',
    actor,actor,asset_rec.asset_id,s.printer_asset_id,null,s.format_key,s.lot,
    p_final_remaining-repair_delta,repair_delta,p_final_remaining,repair_key
  ) returning id into repair_id;

  insert into public.audit_events(entity_type,entity_id,action,actor_id,reason,previous_state,new_state,orbit_event_id)
  values('EVENT_PAPER_CLOSEOUT',s.id::text,'ADMIN_LEDGER_SIGN_REPAIRED',actor,trim(p_reason),
    jsonb_build_object('snapshotId',s.id,'movementNetBefore',movement_net,'wrongDelta',wrong_delta,'masterStock',stock),
    jsonb_build_object('snapshotId',s.id,'movementNetAfter',movement_net+repair_delta,'repairDelta',repair_delta,'masterStock',stock,'movementId',repair_id),event_id);

  insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,reason,
    actor_label,actor_id,source,action,entity_type,entity_id,human_message,correlation_id)
  values(customer_id,p_project_id,event_id,'STAFF_PAPER_ADMIN_CORRECTION',
    'Reparación auditada de movimiento de cierre',
    format('Caja %s · ledger %s → %s · Master %s (sin cambio)',asset_rec.asset_code,movement_net,movement_net+repair_delta,stock),
    trim(p_reason),'Administrador',actor,'Administrator','STAFF_PAPER_ADMIN_CORRECTION',
    'EventPaperSnapshot',s.id::text,
    'Se compensó el signo incorrecto de un movimiento previo; no se repitió el cierre ni se modificó el stock Master.',
    repair_key);

  return jsonb_build_object('duplicate',false,'repaired',true,'snapshot_id',s.id,
    'movement_net_before',movement_net,'repair_delta',repair_delta,
    'movement_net_after',movement_net+repair_delta,'master_stock',stock,'movement_id',repair_id);
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
      return public.admin_repair_ccu_closeout_movement_sign(
        p_project_id, p_asset_assignment_id, p_final_remaining, p_reason, p_idempotency_key
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

    movement_delta := p_final_remaining - previous_final;
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

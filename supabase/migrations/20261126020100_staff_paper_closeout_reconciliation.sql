-- Finalize inventory and the financial snapshot once per assigned box.
CREATE OR REPLACE FUNCTION public.record_staff_paper_block_closeout(p_project_id uuid, p_block_id uuid, p_operator_assignment_id uuid, p_opening integer, p_reloads integer, p_remaining integer, p_request_id uuid, p_staff_id uuid, p_portal_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  assignment_row record;
  block_row record;
  asset_row record;
  previous_block_id uuid;
  previous_closeout record;
  existing_closeout record;
  closeout_id uuid;
  final_block boolean := false;
  total_available integer;
  total_used integer;
  movement_id uuid;
  lot_row record;
  project_row record;
  final_asset_id uuid;
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

  select s.id, s.opening_balance, s.status, s.asset_assignment_id, s.media_lot_id, s.format_key, s.printer_asset_id, s.lot
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

  if snapshot_row.status in ('CONFIRMED','OVERRIDDEN') then
    raise exception 'El papel de esta Caja ya está cerrado para el evento.';
  end if;
  select b.id into previous_block_id
    from public.event_operational_blocks b
   where b.project_id = p_project_id and b.sequence < block_row.sequence
     and exists (
       select 1 from public.projects p
       cross join lateral jsonb_array_elements(p.operations->'totemLayout'->'positions') pos
       cross join lateral jsonb_array_elements(pos->'blocks') shift
       where p.id=p_project_id and pos->>'assetId'=asset_row.asset_id::text
         and shift->>'blockId'=b.id::text and nullif(shift->>'assignmentId','') is not null
     )
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
    -- PM may register its own verified reloads; they are included in
    -- total_available and reconciled once at the final block.
  elsif p_opening <> snapshot_row.opening_balance::integer or p_reloads <> snapshot_reload_total then
    raise exception 'El cierre AM no coincide con el snapshot y las recargas registradas.';
  end if;

  select not exists(
    select 1 from public.event_operational_blocks later
     join public.projects p on p.id=later.project_id
     cross join lateral jsonb_array_elements(p.operations->'totemLayout'->'positions') pos
     cross join lateral jsonb_array_elements(pos->'blocks') shift
     where later.project_id = p_project_id and later.sequence > block_row.sequence
       and pos->>'assetId'=asset_row.asset_id::text and shift->>'blockId'=later.id::text
       and nullif(shift->>'assignmentId','') is not null
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
  if final_block then
    select c.asset_id, c.remaining
      into final_asset_id, final_remaining
      from public.event_box_paper_block_closeouts c
     where c.id = closeout_id
     for update;

    select snapshot_row.opening_balance + coalesce(sum(c.reloads),0)
      into total_available from public.event_box_paper_block_closeouts c
     where c.project_id=p_project_id and c.asset_id=final_asset_id;
    total_used := total_available - final_remaining;
    if total_used < 0 then raise exception 'Saldo final superior al papel disponible.'; end if;

    select p.orbit_event_id, p.customer_id into orbit_event_id, customer_id
      from public.projects p where p.id = p_project_id;

    select l.* into lot_row
      from public.box_media_lots l
     where l.id = snapshot_row.media_lot_id and l.box_asset_id = final_asset_id and l.status <> 'DISCARDED'
     order by l.loaded_at desc limit 1
     for update;
    if snapshot_row.media_lot_id is not null and not found then
      raise exception 'Lote de papel no disponible.';
    end if;
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
      select a.version, coalesce((a.metadata->>'blackBoxPhotoStock')::numeric, total_available)
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
      if total_used > 0 then
        insert into public.inventory_movements(
          customer_id, project_id, orbit_event_id, staff_id, movement_type,
          quantity, occurred_at, reason, box_asset_id, printer_asset_id, format_key, lot,
          quantity_before, quantity_delta, quantity_after, idempotency_key
        ) values (
          customer_id, p_project_id, orbit_event_id, p_staff_id, 'EVENT_USAGE',
          -total_used, now(), 'Consumo de papel conciliado por bloques', final_asset_id,
          snapshot_row.printer_asset_id, snapshot_row.format_key, snapshot_row.lot,
          total_available, -total_used, final_remaining, inventory_key || final_asset_id::text
        ) returning id into movement_id;
      end if;
    end if;
    update public.event_box_paper_block_closeouts
       set inventory_reconciled_at = now(), inventory_movement_id = movement_id
     where id = closeout_id and inventory_reconciled_at is null;
    update public.event_paper_snapshots
       set status='CONFIRMED', final_remaining_balance=final_remaining, event_usage=total_used,
           confirmed_by=p_staff_id, confirmed_at=now(), master_stock_before=total_available,
           master_stock_after=final_remaining
     where id=snapshot_row.id;
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
    'inventory_reconciled', final_block,
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
$function$;

CREATE OR REPLACE FUNCTION public.confirm_staff_event_paper_closeout(p_project_id uuid, p_asset_assignment_id uuid, p_final_remaining numeric, p_note text, p_idempotency_key text, p_staff_id uuid, p_portal_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  snapshot_row public.event_paper_snapshots%rowtype;
  assignment_row record;
  asset_row public.operational_assets%rowtype;
  lot_row public.box_media_lots%rowtype;
  project_row record;
  actor_profile_id uuid;
  reload_total numeric:=0;
  expected_balance numeric;
  usage numeric;
  movement_id uuid;
  master_version_after integer;
  current_stock numeric;
  asset_code text;
begin
  select a.resolved_staff_id,a.profile_id into p_staff_id,actor_profile_id
  from public.resolve_phase_c_staff_portal_actor(p_staff_id,p_portal_session_id) a;
  if p_final_remaining is null or p_final_remaining<0 or p_final_remaining<>trunc(p_final_remaining)
     or nullif(trim(p_idempotency_key),'') is null then
    raise exception 'Ingresa un saldo final entero válido.';
  end if;

  select * into snapshot_row
  from public.event_paper_snapshots
  where project_id=p_project_id and asset_assignment_id=p_asset_assignment_id
  for update;
  if not found or not snapshot_row.paper_required then raise exception 'Este evento no tiene una carga de papel válida.'; end if;
  if snapshot_row.status in('CONFIRMED','OVERRIDDEN') then
    if snapshot_row.final_remaining_balance is distinct from p_final_remaining then
      raise exception 'El cierre ya existe con otro saldo final.';
    end if;
    return jsonb_build_object('snapshot_id',snapshot_row.id,'duplicate',true,'event_usage',snapshot_row.event_usage,'final_remaining',snapshot_row.final_remaining_balance);
  end if;

  select aa.id,aa.asset_id,aa.assignment_status,asset.asset_code,asset.asset_type
    into assignment_row
  from public.asset_assignments aa
  join public.operational_assets asset on asset.id=aa.asset_id
  where aa.id=p_asset_assignment_id and aa.project_id=p_project_id
    and aa.assignment_status='ASSIGNED' and aa.deleted_at is null
  for update;
  if not found or assignment_row.asset_id is distinct from snapshot_row.box_asset_id then
    raise exception 'La Caja activa del evento cambió. Revisión de Admin requerida.';
  end if;

  -- A DISASSEMBLY assignment, a traditional unblocked OPERATOR, or the
  -- highest-sequence OPERATOR block may perform the global closeout. An
  -- intermediate block can never release the box or update Master stock.
  if not exists (
    select 1
    from public.assignments a
    where a.project_id=p_project_id
      and a.staff_id=p_staff_id
      and a.deleted_at is null
      and a.status in('CONFIRMED','ACCEPTED','COMPLETED')
      and (
        a.assignment_type='DISASSEMBLY'
        or (a.assignment_type='OPERATOR' and (
          a.block_id is null
          or not exists (
            select 1
            from public.assignments later
            join public.event_operational_blocks later_block on later_block.id=later.block_id
            join public.event_operational_blocks own_block on own_block.id=a.block_id
            where later.project_id=a.project_id
              and later.assignment_type='OPERATOR'
              and later.deleted_at is null
              and later.status in('CONFIRMED','ACCEPTED','COMPLETED')
              and later.block_id is not null
              and later_block.sequence>own_block.sequence
          )
        ))
      )
  ) then
    raise exception 'Solo el responsable del cierre final puede cerrar el papel del Evento.';
  end if;

  if not exists(
    select 1 from public.assignments
    where project_id=p_project_id and staff_id=p_staff_id and assignment_type='OPERATOR'
      and status in('CONFIRMED','ACCEPTED','COMPLETED') and deleted_at is null
  ) then raise exception 'Solo el Operador asignado puede cerrar el papel.'; end if;

  select * into asset_row from public.operational_assets where id=assignment_row.asset_id for update;
  asset_code:=asset_row.asset_code;
  if asset_row.asset_type not in ('CASE','BOX') then raise exception 'La asignación no corresponde a una Caja Negra.'; end if;

  if snapshot_row.media_lot_id is not null then
    select * into lot_row from public.box_media_lots where id=snapshot_row.media_lot_id and status<>'DISCARDED' for update;
    if not found then raise exception 'Lote de papel no disponible.'; end if;
    select coalesce(sum(quantity),0) into reload_total from public.event_paper_reloads where snapshot_id=snapshot_row.id;
    expected_balance:=snapshot_row.opening_balance+reload_total;
    if lot_row.remaining_photo_capacity<>expected_balance then raise exception 'El saldo de papel cambió fuera de este evento. Revisa la Caja antes de cerrar.'; end if;
  else
    expected_balance:=snapshot_row.opening_balance;
  end if;
  current_stock:=coalesce((asset_row.metadata->>'blackBoxPhotoStock')::numeric,expected_balance);
  if current_stock<>expected_balance then raise exception 'El stock Master cambió fuera de este evento. Revisión de Admin requerida.'; end if;
  if p_final_remaining>expected_balance then raise exception 'El stock final no puede ser mayor al stock inicial registrado para este evento.'; end if;
  usage:=expected_balance-p_final_remaining;

  if usage>0 then
    insert into public.inventory_movements(
      customer_id,supply_id,project_id,orbit_event_id,staff_id,movement_type,quantity,occurred_at,reason,
      created_by,updated_by,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,
      quantity_before,quantity_delta,quantity_after,portal_session_id
    )
    select p.customer_id,lot_row.supply_id,p_project_id,p.orbit_event_id,p_staff_id,'EVENT_USAGE',-usage,now(),
      coalesce(nullif(trim(p_note),''),'Consumo de papel del evento'),actor_profile_id,actor_profile_id,
      asset_row.id,snapshot_row.printer_asset_id,lot_row.id,coalesce(lot_row.format_key,snapshot_row.format_key),coalesce(lot_row.lot,snapshot_row.lot),
      expected_balance,-usage,p_final_remaining,p_portal_session_id
    from public.projects p where p.id=p_project_id returning id into movement_id;
  end if;

  update public.operational_assets
  set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{blackBoxPhotoStock}',to_jsonb(p_final_remaining),true),
      updated_by=actor_profile_id
  where id=asset_row.id and version=asset_row.version
    and coalesce((metadata->>'blackBoxPhotoStock')::numeric,expected_balance)=expected_balance
  returning version into master_version_after;
  if master_version_after is null then raise exception 'Conflicto de versión del stock Master. Revisión de Admin requerida.'; end if;

  select p.id,p.customer_id,p.orbit_event_id into project_row from public.projects p where p.id=p_project_id;
  update public.event_paper_snapshots
  set status='CONFIRMED',final_remaining_balance=p_final_remaining,event_usage=usage,
      confirmed_by=p_staff_id,portal_session_id=p_portal_session_id,confirmed_at=now(),close_note=nullif(trim(p_note),''),
      master_asset_version_before=asset_row.version,master_asset_version_after=master_version_after,
      master_stock_before=expected_balance,master_stock_after=p_final_remaining
  where id=snapshot_row.id;

  insert into public.audit_events(entity_type,entity_id,action,actor_id,reason,previous_state,new_state,orbit_event_id)
  values('EVENT_PAPER_CLOSEOUT',snapshot_row.id::text,'CLOSED',actor_profile_id,nullif(trim(p_note),''),
    jsonb_build_object('eventId',p_project_id,'assetId',asset_row.id,'assetCode',asset_code,'initial',expected_balance,'format',coalesce(snapshot_row.black_box_paper_format,snapshot_row.format_key),'masterVersion',asset_row.version),
    jsonb_build_object('eventId',p_project_id,'assetId',asset_row.id,'assetCode',asset_code,'final',p_final_remaining,'consumption',usage,'format',coalesce(snapshot_row.black_box_paper_format,snapshot_row.format_key),'masterVersion',master_version_after,'closedBy',p_staff_id,'closedAt',now()),
    project_row.orbit_event_id);
  insert into public.timeline_events(customer_id,project_id,staff_id,orbit_event_id,event_type,title,description,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason)
  values(project_row.customer_id,p_project_id,p_staff_id,project_row.orbit_event_id,'STAFF_PAPER_CLOSEOUT','Cierre de papel confirmado',
    format('Caja %s · inicial %s · final %s · consumido %s · formato %s',asset_code,expected_balance,p_final_remaining,usage,coalesce(snapshot_row.black_box_paper_format,snapshot_row.format_key,'Pendiente')),
    'Operador','Staff','STAFF_PAPER_CLOSEOUT','EventPaperSnapshot',snapshot_row.id,'El Operador informó el stock final de papel.',
    'staff-paper-closeout:'||snapshot_row.id,'Cierre de papel');
  return jsonb_build_object('snapshot_id',snapshot_row.id,'duplicate',false,'opening_balance',snapshot_row.opening_balance,'reloads',reload_total,'final_remaining',p_final_remaining,'event_usage',usage,'master_asset_id',asset_row.id,'master_asset_code',asset_code,'master_version_before',asset_row.version,'master_version_after',master_version_after,'movement_id',movement_id);
end $function$;

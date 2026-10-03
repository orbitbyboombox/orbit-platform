begin;

-- Staff paper closeout uses the canonical timeline_events source value.
-- "StaffPortal" is not allowed by timeline_events_source_check; "Staff" is.
create or replace function public.confirm_staff_event_paper_closeout(
  p_project_id uuid,p_asset_assignment_id uuid,p_final_remaining numeric,p_note text,p_idempotency_key text,
  p_staff_id uuid,p_portal_session_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
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

  if usage>0 and snapshot_row.media_lot_id is not null then
    insert into public.inventory_movements(
      supply_id,project_id,orbit_event_id,staff_id,movement_type,quantity,occurred_at,reason,
      created_by,updated_by,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,
      quantity_before,quantity_delta,quantity_after,portal_session_id
    )
    select lot_row.supply_id,p_project_id,p.orbit_event_id,p_staff_id,'EVENT_USAGE',-usage,now(),
      coalesce(nullif(trim(p_note),''),'Consumo de papel del evento'),actor_profile_id,actor_profile_id,
      lot_row.box_asset_id,lot_row.printer_asset_id,lot_row.id,lot_row.format_key,lot_row.lot,
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
end $$;

revoke all on function public.confirm_staff_event_paper_closeout(uuid,uuid,numeric,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_staff_event_paper_closeout(uuid,uuid,numeric,text,text,uuid,uuid) to service_role;

commit;

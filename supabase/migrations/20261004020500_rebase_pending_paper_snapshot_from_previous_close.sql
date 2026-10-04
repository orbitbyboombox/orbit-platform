create or replace function public.phase_c5_snapshot_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  safe_pending_rebase boolean :=
    old.status = 'PENDING'
    and new.status = 'PENDING'
    and old.final_remaining_balance is null
    and new.final_remaining_balance is null
    and old.event_usage is null
    and new.event_usage is null
    and old.confirmed_by is null
    and new.confirmed_by is null;
begin
  if old.project_id is distinct from new.project_id or old.orbit_event_id is distinct from new.orbit_event_id
     or old.asset_assignment_id is distinct from new.asset_assignment_id or old.box_asset_id is distinct from new.box_asset_id
     or old.printer_asset_id is distinct from new.printer_asset_id or old.media_lot_id is distinct from new.media_lot_id
     or old.format_key is distinct from new.format_key or old.lot is distinct from new.lot
     or old.paper_required is distinct from new.paper_required
     or (old.opening_balance is distinct from new.opening_balance and not safe_pending_rebase)
     or old.black_box_asset_code is distinct from new.black_box_asset_code
     or old.black_box_name is distinct from new.black_box_name
     or (old.black_box_initial_photo_stock is distinct from new.black_box_initial_photo_stock and not safe_pending_rebase)
     or old.black_box_paper_format is distinct from new.black_box_paper_format
     or old.black_box_assigned_at is distinct from new.black_box_assigned_at
     or old.black_box_assigned_by is distinct from new.black_box_assigned_by then
    raise exception 'Event paper opening snapshot is immutable.';
  end if;
  return new;
end $function$;

create or replace function public.rebase_pending_event_paper_snapshot(
  p_project_id uuid,
  p_asset_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  snapshot_row public.event_paper_snapshots%rowtype;
  asset_row public.operational_assets%rowtype;
  previous_final numeric;
  current_stock numeric;
  reload_total numeric := 0;
begin
  select * into snapshot_row
  from public.event_paper_snapshots
  where project_id = p_project_id and asset_assignment_id = p_asset_assignment_id
  for update;
  if not found then return jsonb_build_object('rebased', false, 'reason', 'NO_SNAPSHOT'); end if;
  if snapshot_row.status <> 'PENDING'
     or snapshot_row.final_remaining_balance is not null
     or snapshot_row.event_usage is not null then
    return jsonb_build_object('rebased', false, 'reason', 'NOT_PENDING');
  end if;
  select coalesce(sum(quantity),0) into reload_total
  from public.event_paper_reloads where snapshot_id = snapshot_row.id;
  if reload_total <> 0 then return jsonb_build_object('rebased', false, 'reason', 'HAS_RELOADS'); end if;

  select * into asset_row from public.operational_assets where id = snapshot_row.box_asset_id for update;
  if not found then return jsonb_build_object('rebased', false, 'reason', 'NO_ASSET'); end if;

  current_stock := nullif(asset_row.metadata->>'blackBoxPhotoStock','')::numeric;
  if current_stock is null or current_stock = snapshot_row.opening_balance then
    return jsonb_build_object('rebased', false, 'reason', 'ALREADY_CURRENT', 'opening_balance', snapshot_row.opening_balance);
  end if;

  select eps.final_remaining_balance into previous_final
  from public.event_paper_snapshots eps
  join public.projects p on p.id = eps.project_id
  join public.projects current_p on current_p.id = p_project_id
  where eps.box_asset_id = snapshot_row.box_asset_id
    and eps.id <> snapshot_row.id
    and eps.status in ('CONFIRMED','OVERRIDDEN')
    and eps.final_remaining_balance is not null
    and (
      p.event_date < current_p.event_date
      or (p.event_date = current_p.event_date and coalesce(p.event_time,'00:00:00'::time) <= coalesce(current_p.event_time,'23:59:59'::time))
    )
  order by p.event_date desc, p.event_time desc nulls last, eps.confirmed_at desc nulls last
  limit 1;

  if previous_final is null or previous_final <> current_stock then
    return jsonb_build_object('rebased', false, 'reason', 'MASTER_NOT_EXPLAINED_BY_PREVIOUS_CLOSE',
      'opening_balance', snapshot_row.opening_balance, 'master_stock', current_stock);
  end if;

  update public.event_paper_snapshots
  set opening_balance = current_stock,
      black_box_initial_photo_stock = current_stock,
      master_stock_before = current_stock,
      master_asset_version_before = asset_row.version
  where id = snapshot_row.id;

  insert into public.audit_events(entity_type,entity_id,action,reason,previous_state,new_state,orbit_event_id)
  values('EVENT_PAPER_SNAPSHOT',snapshot_row.id::text,'PENDING_OPENING_REBASED',
    'Saldo inicial actualizado desde el último cierre confirmado de la misma Caja.',
    jsonb_build_object('opening_balance',snapshot_row.opening_balance),
    jsonb_build_object('opening_balance',current_stock,'asset_version',asset_row.version),
    snapshot_row.orbit_event_id);

  return jsonb_build_object('rebased',true,'previous_opening_balance',snapshot_row.opening_balance,
    'opening_balance',current_stock,'asset_version',asset_row.version);
end $function$;

grant execute on function public.rebase_pending_event_paper_snapshot(uuid,uuid) to service_role;

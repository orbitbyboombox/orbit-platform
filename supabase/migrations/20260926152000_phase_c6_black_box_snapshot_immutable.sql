begin;
create or replace function public.phase_c5_snapshot_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.project_id is distinct from new.project_id or old.orbit_event_id is distinct from new.orbit_event_id
     or old.asset_assignment_id is distinct from new.asset_assignment_id or old.box_asset_id is distinct from new.box_asset_id
     or old.printer_asset_id is distinct from new.printer_asset_id or old.media_lot_id is distinct from new.media_lot_id
     or old.format_key is distinct from new.format_key or old.lot is distinct from new.lot
     or old.paper_required is distinct from new.paper_required or old.opening_balance is distinct from new.opening_balance
     or old.black_box_asset_code is distinct from new.black_box_asset_code
     or old.black_box_name is distinct from new.black_box_name
     or old.black_box_initial_photo_stock is distinct from new.black_box_initial_photo_stock
     or old.black_box_paper_format is distinct from new.black_box_paper_format
     or old.black_box_assigned_at is distinct from new.black_box_assigned_at
     or old.black_box_assigned_by is distinct from new.black_box_assigned_by then
    raise exception 'Event paper opening snapshot is immutable.';
  end if;
  return new;
end $$;
commit;

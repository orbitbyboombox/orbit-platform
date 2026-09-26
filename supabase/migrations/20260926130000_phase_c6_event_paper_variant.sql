begin;

-- C.6 event metadata is separate from the immutable inventory format_key.
alter table public.event_paper_snapshots
  add column if not exists paper_variant text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_paper_snapshots_paper_variant_check'
      and conrelid = 'public.event_paper_snapshots'::regclass
  ) then
    alter table public.event_paper_snapshots
      add constraint event_paper_snapshots_paper_variant_check
      check (paper_variant is null or paper_variant in ('NORMAL_4X6','PRECUT_4X6'));
  end if;
end $$;

create or replace function public.phase_c5_snapshot_immutable()
returns trigger language plpgsql as $$
begin
  if old.project_id is distinct from new.project_id or old.orbit_event_id is distinct from new.orbit_event_id
     or old.asset_assignment_id is distinct from new.asset_assignment_id or old.box_asset_id is distinct from new.box_asset_id
     or old.printer_asset_id is distinct from new.printer_asset_id or old.media_lot_id is distinct from new.media_lot_id
     or old.format_key is distinct from new.format_key or old.lot is distinct from new.lot
     or old.paper_required is distinct from new.paper_required or old.opening_balance is distinct from new.opening_balance then
    raise exception 'Event paper opening snapshot is immutable.';
  end if;
  if old.status in ('CONFIRMED','OVERRIDDEN') and old.paper_variant is distinct from new.paper_variant then
    raise exception 'Event paper variant is immutable after closeout.';
  end if;
  return new;
end $$;

commit;

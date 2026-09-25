begin;

-- Phase C.2 extends the existing supplies/inventory ledger. A media lot is a
-- traceable load of a canonical supply into a BOX/printer; it is not a second
-- stock system.
alter table public.supplies
  add column if not exists catalog_code text,
  add column if not exists current_stock numeric(14,3) not null default 0,
  add column if not exists minimum_stock numeric(14,3),
  add column if not exists recommended_purchase numeric(14,3),
  add column if not exists stock_status text not null default 'NORMAL',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists approval_reason text,
  add column if not exists deleted_by uuid references auth.users(id);

update public.supplies set catalog_code=coalesce(catalog_code,'legacy-'||id::text) where catalog_code is null;
alter table public.supplies alter column catalog_code set not null;
alter table public.supplies drop constraint if exists supplies_stock_status_check;
alter table public.supplies add constraint supplies_stock_status_check
  check(stock_status in ('NORMAL','LOW_STOCK','OUT_OF_STOCK'));
create unique index if not exists supplies_catalog_code_idx on public.supplies(catalog_code);
create index if not exists supplies_active_name_idx on public.supplies(name) where deleted_at is null;

-- TEST was missing the canonical base table present in Production. This is the
-- same 0005 contract plus media linkage columns, kept backwards compatible for
-- legacy movements.
create table if not exists public.inventory_movements(
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.supplies(id),
  orbit_event_id text,
  customer_id uuid references public.customers(id),
  project_id uuid references public.projects(id) on delete cascade,
  staff_id uuid references public.staff(id),
  vehicle_id text,
  movement_type text not null check(movement_type in('PURCHASE','CONSUMPTION','ADJUSTMENT','LOSS','REPLACEMENT','LOAD','EVENT_USAGE','MANUAL_ADJUSTMENT','RETURN','DISCARD')),
  quantity numeric(14,3) not null check(quantity<>0),
  unit_cost numeric(14,2),
  total_cost numeric(14,2),
  occurred_at timestamptz not null,
  reason text not null,
  version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz
);

alter table public.inventory_movements
  add column if not exists box_asset_id uuid references public.operational_assets(id),
  add column if not exists printer_asset_id uuid references public.operational_assets(id),
  add column if not exists media_lot_id uuid,
  add column if not exists format_key text,
  add column if not exists lot text,
  add column if not exists quantity_before numeric(14,3),
  add column if not exists quantity_delta numeric(14,3),
  add column if not exists quantity_after numeric(14,3);

alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check
  check(movement_type in('PURCHASE','CONSUMPTION','ADJUSTMENT','LOSS','REPLACEMENT','LOAD','EVENT_USAGE','MANUAL_ADJUSTMENT','RETURN','DISCARD'));

create index if not exists inventory_movements_supply_time_idx on public.inventory_movements(supply_id,occurred_at desc,id desc);
create index if not exists inventory_movements_project_time_idx on public.inventory_movements(project_id,occurred_at desc,id desc);
create index if not exists inventory_movements_orbit_event_idx on public.inventory_movements(orbit_event_id) where orbit_event_id is not null;
create index if not exists inventory_movements_media_lot_time_idx on public.inventory_movements(media_lot_id,occurred_at desc,id desc) where media_lot_id is not null;
create index if not exists inventory_movements_box_time_idx on public.inventory_movements(box_asset_id,occurred_at desc,id desc) where box_asset_id is not null;

create table if not exists public.box_media_formats(
  format_key text primary key,
  label text not null,
  width_mm integer not null check(width_mm>0),
  height_mm integer not null check(height_mm>0),
  enabled boolean not null default true,
  version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.box_media_formats(format_key,label,width_mm,height_mm) values
  ('PHOTO_5X15','5x15',50,150),
  ('PHOTO_10X15','10x15',100,150),
  ('PHOTO_7_5X10','7.5x10',75,100)
on conflict(format_key) do update set label=excluded.label,width_mm=excluded.width_mm,height_mm=excluded.height_mm;

create table if not exists public.box_media_lots(
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.supplies(id),
  box_asset_id uuid not null references public.operational_assets(id),
  printer_asset_id uuid references public.operational_assets(id),
  format_key text not null references public.box_media_formats(format_key),
  lot text not null check(length(trim(lot))>0),
  loaded_at timestamptz not null default now(),
  initial_photo_capacity numeric(14,3) not null check(initial_photo_capacity>0),
  remaining_photo_capacity numeric(14,3) not null check(remaining_photo_capacity>=0 and remaining_photo_capacity<=initial_photo_capacity),
  low_stock_threshold numeric(14,3) not null default 100 check(low_stock_threshold>=0),
  status text not null default 'ACTIVE' check(status in('ACTIVE','EMPTY','DISCARDED')),
  notes text,
  version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.box_media_lot_asset_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare box_type text; printer_type text; printer_parent uuid;
begin
  select asset_type into box_type from public.operational_assets where id=new.box_asset_id and deleted_at is null;
  if box_type is distinct from 'BOX' then raise exception 'Media lot requires a BOX asset.'; end if;
  if new.printer_asset_id is not null then
    select asset_type,parent_asset_id into printer_type,printer_parent
      from public.operational_assets where id=new.printer_asset_id and deleted_at is null;
    if printer_type is distinct from 'PRINTER' or printer_parent is distinct from new.box_asset_id then
      raise exception 'Printer must be an active child of the selected BOX.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists box_media_lot_asset_guard on public.box_media_lots;
create trigger box_media_lot_asset_guard before insert or update on public.box_media_lots
for each row execute function public.box_media_lot_asset_guard();

alter table public.inventory_movements
  drop constraint if exists inventory_movements_media_lot_id_fkey;
alter table public.inventory_movements
  add constraint inventory_movements_media_lot_id_fkey foreign key(media_lot_id) references public.box_media_lots(id);

create index if not exists box_media_lots_box_idx on public.box_media_lots(box_asset_id,status,loaded_at desc);
create index if not exists box_media_lots_printer_idx on public.box_media_lots(printer_asset_id,status,loaded_at desc) where printer_asset_id is not null;
create index if not exists box_media_lots_supply_idx on public.box_media_lots(supply_id,status,loaded_at desc);

alter table public.box_media_formats enable row level security;
drop policy if exists box_media_formats_internal_read on public.box_media_formats;
create policy box_media_formats_internal_read on public.box_media_formats for select to authenticated using(public.is_internal_user());
drop policy if exists box_media_formats_admin_write on public.box_media_formats;
create policy box_media_formats_admin_write on public.box_media_formats for all to authenticated using(public.can_administer()) with check(public.can_administer());
grant select,insert,update on public.box_media_formats to authenticated;

alter table public.box_media_lots enable row level security;
drop policy if exists box_media_lots_internal_read on public.box_media_lots;
create policy box_media_lots_internal_read on public.box_media_lots for select to authenticated using(public.is_internal_user());
drop policy if exists box_media_lots_admin_write on public.box_media_lots;
create policy box_media_lots_admin_write on public.box_media_lots for all to authenticated using(public.can_administer()) with check(public.can_administer());
grant select,insert,update on public.box_media_lots to authenticated;

alter table public.inventory_movements enable row level security;
drop policy if exists inventory_movements_internal_read on public.inventory_movements;
create policy inventory_movements_internal_read on public.inventory_movements for select to authenticated using(public.is_internal_user());
drop policy if exists inventory_movements_admin_write on public.inventory_movements;
create policy inventory_movements_admin_write on public.inventory_movements for all to authenticated using(public.can_administer()) with check(public.can_administer());
grant select,insert,update on public.inventory_movements to authenticated;

drop trigger if exists box_media_formats_touch on public.box_media_formats;
create trigger box_media_formats_touch before update on public.box_media_formats for each row execute function public.touch_versioned_row();
drop trigger if exists box_media_lots_touch on public.box_media_lots;
create trigger box_media_lots_touch before update on public.box_media_lots for each row execute function public.touch_versioned_row();
drop trigger if exists box_media_lots_audit on public.box_media_lots;
create trigger box_media_lots_audit after insert or update or delete on public.box_media_lots for each row execute function public.audit_row_change();
drop trigger if exists inventory_movements_touch on public.inventory_movements;
create trigger inventory_movements_touch before update on public.inventory_movements for each row execute function public.touch_versioned_row();
drop trigger if exists inventory_movements_audit on public.inventory_movements;
create trigger inventory_movements_audit after insert or update or delete on public.inventory_movements for each row execute function public.audit_row_change();

create or replace function public.refresh_supply_stock()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_supply_id uuid; resulting_stock numeric(14,3);
begin
  target_supply_id:=coalesce(new.supply_id,old.supply_id);
  select coalesce(sum(quantity),0) into resulting_stock from public.inventory_movements where supply_id=target_supply_id and deleted_at is null;
  update public.supplies set current_stock=resulting_stock,stock_status=case when resulting_stock<=0 then 'OUT_OF_STOCK' when minimum_stock is not null and resulting_stock<=minimum_stock then 'LOW_STOCK' else 'NORMAL' end where id=target_supply_id;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
drop trigger if exists inventory_movements_refresh_stock on public.inventory_movements;
create trigger inventory_movements_refresh_stock after insert or update or delete on public.inventory_movements for each row execute function public.refresh_supply_stock();

create or replace function public.record_inventory_timeline()
returns trigger language plpgsql security definer set search_path=public as $$
declare movement_label text;
begin
  if new.project_id is null then return new; end if;
  movement_label:=case new.movement_type
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
  insert into public.timeline_events(customer_id,project_id,event_type,title,description,reason,occurred_at,created_by,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values(new.customer_id,new.project_id,'SUPPLY_'||new.movement_type,movement_label,movement_label,new.reason,new.occurred_at,new.created_by,coalesce(new.orbit_event_id,'SUPPLY-'||new.id::text),new.created_by,'Operaciones','Operations','SUPPLY_'||new.movement_type,'Supply',new.supply_id::text,movement_label,'inventory-'||new.id::text);
  return new;
end $$;
drop trigger if exists inventory_movements_timeline on public.inventory_movements;
create trigger inventory_movements_timeline after insert on public.inventory_movements for each row execute function public.record_inventory_timeline();

create or replace function public.box_media_movement_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare lot_row public.box_media_lots%rowtype;
begin
  if new.media_lot_id is null then return new; end if;
  select * into lot_row from public.box_media_lots where id=new.media_lot_id for update;
  if not found then raise exception 'Media lot not found.'; end if;
  if new.supply_id<>lot_row.supply_id or new.box_asset_id<>lot_row.box_asset_id or new.printer_asset_id is distinct from lot_row.printer_asset_id then raise exception 'Media movement linkage mismatch.'; end if;
  if new.format_key<>lot_row.format_key or new.lot<>lot_row.lot then raise exception 'Media movement identity mismatch.'; end if;
  if new.quantity_before is null or new.quantity_delta is null or new.quantity_after is null then raise exception 'Media movement requires before, delta and after.'; end if;
  if new.quantity_before<>lot_row.remaining_photo_capacity then raise exception 'Media balance changed; reload the box state.'; end if;
  if new.quantity_delta<>new.quantity or new.quantity_after<>(new.quantity_before+new.quantity_delta) then raise exception 'Media balance equation is invalid.'; end if;
  if new.quantity_after<0 or new.quantity_after>lot_row.initial_photo_capacity then raise exception 'Media balance cannot be negative or exceed initial capacity.'; end if;
  if new.movement_type not in('LOAD','EVENT_USAGE','MANUAL_ADJUSTMENT','RETURN','DISCARD') then raise exception 'Invalid media movement type.'; end if;
  if new.movement_type='RETURN' and new.quantity_delta>0 and upper(coalesce(new.reason,'')) not like '%ADJUST%' then
    raise exception 'A positive RETURN requires an explicit adjustment reason.';
  end if;
  return new;
end $$;
drop trigger if exists box_media_movement_guard on public.inventory_movements;
create trigger box_media_movement_guard before insert on public.inventory_movements for each row execute function public.box_media_movement_guard();

create or replace function public.box_media_movement_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
  if coalesce(old.media_lot_id,new.media_lot_id) is not null then raise exception 'Media movement history is immutable.'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
drop trigger if exists box_media_movement_immutable on public.inventory_movements;
create trigger box_media_movement_immutable before update or delete on public.inventory_movements for each row execute function public.box_media_movement_immutable();

create or replace function public.sync_box_media_lot_balance()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.media_lot_id is not null then
    update public.box_media_lots set remaining_photo_capacity=new.quantity_after,
      status=case when new.quantity_after=0 then 'EMPTY' else 'ACTIVE' end,
      updated_by=new.created_by where id=new.media_lot_id;
  end if;
  return new;
end $$;
drop trigger if exists inventory_movements_sync_media_lot on public.inventory_movements;
create trigger inventory_movements_sync_media_lot after insert on public.inventory_movements
for each row execute function public.sync_box_media_lot_balance();

revoke all on function public.box_media_lot_asset_guard() from public,anon,authenticated;
revoke all on function public.box_media_movement_guard() from public,anon,authenticated;
revoke all on function public.box_media_movement_immutable() from public,anon,authenticated;
revoke all on function public.sync_box_media_lot_balance() from public,anon,authenticated;
revoke all on function public.record_inventory_timeline() from public,anon,authenticated;
revoke all on function public.refresh_supply_stock() from public,anon,authenticated;

create or replace function public.apply_box_media_movement(
  p_media_lot_id uuid,p_movement_type text,p_quantity_delta numeric,p_occurred_at timestamptz,
  p_reason text,p_project_id uuid default null,p_orbit_event_id text default null,
  p_staff_id uuid default null,p_actor_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare lot_row public.box_media_lots%rowtype; movement_id uuid; actor uuid:=coalesce(p_actor_id,auth.uid());
begin
  if actor is null or not exists (select 1 from public.profiles where id=actor and role in ('CEO'::orbit_role,'ADMINISTRATOR'::orbit_role)) then raise exception 'Administrative access required.'; end if;
  if p_quantity_delta=0 then raise exception 'Media movement cannot be zero.'; end if;
  select * into lot_row from public.box_media_lots where id=p_media_lot_id and status<>'DISCARDED' for update;
  if not found then raise exception 'Media lot not found.'; end if;
  insert into public.inventory_movements(
    supply_id,orbit_event_id,project_id,staff_id,movement_type,quantity,occurred_at,reason,
    created_by,updated_by,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,
    quantity_before,quantity_delta,quantity_after
  ) values(
    lot_row.supply_id,p_orbit_event_id,p_project_id,p_staff_id,p_movement_type,p_quantity_delta,coalesce(p_occurred_at,now()),p_reason,
    actor,actor,lot_row.box_asset_id,lot_row.printer_asset_id,p_media_lot_id,lot_row.format_key,lot_row.lot,
    lot_row.remaining_photo_capacity,p_quantity_delta,lot_row.remaining_photo_capacity+p_quantity_delta
  ) returning id into movement_id;
  return movement_id;
end $$;
revoke all on function public.apply_box_media_movement(uuid,text,numeric,timestamptz,text,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_box_media_movement(uuid,text,numeric,timestamptz,text,uuid,text,uuid,uuid) to service_role;

create or replace function public.create_box_media_lot_with_load(
  p_supply_id uuid,p_box_asset_id uuid,p_printer_asset_id uuid,p_format_key text,p_lot text,
  p_loaded_at timestamptz,p_initial_capacity numeric,p_low_stock_threshold numeric,
  p_notes text,p_actor_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare lot_id uuid; actor uuid:=coalesce(p_actor_id,auth.uid());
begin
  if actor is null or not exists (select 1 from public.profiles where id=actor and role in ('CEO'::orbit_role,'ADMINISTRATOR'::orbit_role)) then raise exception 'Administrative access required.'; end if;
  insert into public.box_media_lots(
    supply_id,box_asset_id,printer_asset_id,format_key,lot,loaded_at,initial_photo_capacity,
    remaining_photo_capacity,low_stock_threshold,notes,created_by,updated_by
  ) values(
    p_supply_id,p_box_asset_id,p_printer_asset_id,p_format_key,p_lot,coalesce(p_loaded_at,now()),
    p_initial_capacity,0,coalesce(p_low_stock_threshold,100),p_notes,actor,actor
  ) returning id into lot_id;
  perform public.apply_box_media_movement(lot_id,'LOAD',p_initial_capacity,coalesce(p_loaded_at,now()),'Initial media load',null,null,null,actor);
  return lot_id;
end $$;
revoke all on function public.create_box_media_lot_with_load(uuid,uuid,uuid,text,text,timestamptz,numeric,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.create_box_media_lot_with_load(uuid,uuid,uuid,text,text,timestamptz,numeric,numeric,text,uuid) to service_role;

commit;

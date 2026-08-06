begin;

alter table public.supplies
  add column if not exists catalog_code text,
  add column if not exists current_stock numeric(14,3) not null default 0,
  add column if not exists minimum_stock numeric(14,3),
  add column if not exists recommended_purchase numeric(14,3),
  add column if not exists stock_status text not null default 'NORMAL',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists approval_reason text,
  add column if not exists deleted_by uuid references auth.users(id);

update public.supplies
set catalog_code = coalesce(catalog_code, 'legacy-' || id::text)
where catalog_code is null;

alter table public.supplies alter column catalog_code set not null;

alter table public.supplies
  drop constraint if exists supplies_stock_status_check;
alter table public.supplies
  add constraint supplies_stock_status_check
  check (stock_status in ('NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK'));

create unique index if not exists supplies_catalog_code_idx on public.supplies(catalog_code);
create index if not exists supplies_active_name_idx on public.supplies(name) where deleted_at is null;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.supplies(id),
  orbit_event_id text,
  customer_id uuid references public.customers(id),
  project_id uuid references public.projects(id),
  staff_id uuid references public.staff(id),
  vehicle_id text,
  movement_type text not null check (movement_type in ('PURCHASE', 'CONSUMPTION', 'ADJUSTMENT', 'LOSS', 'REPLACEMENT')),
  quantity numeric(14,3) not null check (quantity <> 0),
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

create index if not exists inventory_movements_supply_time_idx on public.inventory_movements(supply_id, occurred_at desc, id desc);
create index if not exists inventory_movements_project_time_idx on public.inventory_movements(project_id, occurred_at desc, id desc);
create index if not exists inventory_movements_orbit_event_idx on public.inventory_movements(orbit_event_id) where orbit_event_id is not null;

drop trigger if exists inventory_movements_touch on public.inventory_movements;
create trigger inventory_movements_touch
  before update on public.inventory_movements
  for each row execute function public.touch_versioned_row();

drop trigger if exists inventory_movements_audit on public.inventory_movements;
create trigger inventory_movements_audit
  after insert or update or delete on public.inventory_movements
  for each row execute function public.audit_row_change();

alter table public.inventory_movements enable row level security;
drop policy if exists inventory_movements_internal_read on public.inventory_movements;
create policy inventory_movements_internal_read on public.inventory_movements
  for select using (public.is_internal_user());
drop policy if exists inventory_movements_admin_write on public.inventory_movements;
create policy inventory_movements_admin_write on public.inventory_movements
  for all using (public.can_administer()) with check (public.can_administer());

create or replace function public.refresh_supply_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_supply_id uuid;
  resulting_stock numeric(14,3);
begin
  target_supply_id := coalesce(new.supply_id, old.supply_id);
  select coalesce(sum(quantity), 0)
    into resulting_stock
    from public.inventory_movements
   where supply_id = target_supply_id
     and deleted_at is null;

  update public.supplies
     set current_stock = resulting_stock,
         stock_status = case
           when resulting_stock <= 0 then 'OUT_OF_STOCK'
           when minimum_stock is not null and resulting_stock <= minimum_stock then 'LOW_STOCK'
           else 'NORMAL'
         end
   where id = target_supply_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists inventory_movements_refresh_stock on public.inventory_movements;
create trigger inventory_movements_refresh_stock
  after insert or update or delete on public.inventory_movements
  for each row execute function public.refresh_supply_stock();

create or replace function public.record_inventory_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  movement_label text;
begin
  if new.project_id is null then return new; end if;
  movement_label := case new.movement_type
    when 'PURCHASE' then 'Compra de insumo registrada.'
    when 'CONSUMPTION' then 'Consumo de insumo registrado.'
    when 'ADJUSTMENT' then 'Inventario de insumo ajustado.'
    when 'LOSS' then 'Pérdida de insumo registrada.'
    else 'Reemplazo de insumo registrado.'
  end;
  insert into public.timeline_events (
    customer_id, project_id, event_type, title, description, reason, occurred_at,
    created_by, orbit_event_id, actor_id, actor_label, source, action,
    entity_type, entity_id, human_message, correlation_id
  ) values (
    new.customer_id, new.project_id, 'SUPPLY_' || new.movement_type, movement_label,
    movement_label, new.reason, new.occurred_at, new.created_by,
    coalesce(new.orbit_event_id, 'SUPPLY-' || new.id::text), new.created_by,
    'Operaciones', 'Operations', 'SUPPLY_' || new.movement_type,
    'Supply', new.supply_id::text, movement_label, 'inventory-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists inventory_movements_timeline on public.inventory_movements;
create trigger inventory_movements_timeline
  after insert on public.inventory_movements
  for each row execute function public.record_inventory_timeline();

create or replace function public.register_inventory_movement(
  p_supply_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_occurred_at timestamptz,
  p_reason text,
  p_orbit_event_id text default null,
  p_customer_id uuid default null,
  p_project_id uuid default null,
  p_staff_id uuid default null,
  p_vehicle_id text default null,
  p_unit_cost numeric default null,
  p_actor_id uuid default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare movement_id uuid;
begin
  if p_movement_type not in ('PURCHASE', 'CONSUMPTION', 'ADJUSTMENT', 'LOSS', 'REPLACEMENT') then
    raise exception 'Invalid inventory movement type';
  end if;
  insert into public.inventory_movements (
    supply_id, movement_type, quantity, unit_cost, total_cost, occurred_at, reason,
    orbit_event_id, customer_id, project_id, staff_id, vehicle_id, created_by, updated_by
  ) values (
    p_supply_id, p_movement_type, p_quantity, p_unit_cost,
    case when p_unit_cost is null then null else abs(p_quantity) * p_unit_cost end,
    p_occurred_at, p_reason, p_orbit_event_id, p_customer_id, p_project_id,
    p_staff_id, p_vehicle_id, coalesce(p_actor_id, auth.uid()), coalesce(p_actor_id, auth.uid())
  ) returning id into movement_id;
  return movement_id;
end;
$$;

insert into public.supplies (
  catalog_code, name, supplier, purchase_price, vat_included, unit, useful_life,
  calculation_method, status, current_stock, minimum_stock, recommended_purchase,
  stock_status, metadata
) values
  ('dnp-rx1-media', 'DNP RX1 Media', 'DNP', 260170, true, 'PHOTO', 1400, 'PRODUCTION_OUTPUT', 'ACTIVE', 0, null, null, 'OUT_OF_STOCK', '{"usefulLifeLabel":"1.400 fotografías","productionUnits":1400,"contents":["2 rollos","2 ribbons"]}'),
  ('magnets', 'Imanes', 'Proveedor BOOMBOX', 225000, true, 'EVENT', 100, 'EVENT_CAPACITY', 'LOW_STOCK', 0, null, null, 'OUT_OF_STOCK', '{"usefulLifeLabel":"100 eventos","operationalCapacityEvents":100,"additionalCostBeforeVat":45000,"contents":["Corte: $45.000 + IVA (19%)"]}'),
  ('scrapbook', 'Scrapbook', 'Proveedor BOOMBOX', 7500, true, 'EVENT', 1, 'DIRECT_EVENT_COST', 'ACTIVE', 0, null, null, 'OUT_OF_STOCK', '{"usefulLifeLabel":"1 evento"}'),
  ('pens', 'Lápices', 'Proveedor BOOMBOX', 1900, true, 'MONTH', 2, 'MONTHLY_AMORTIZATION', 'ACTIVE', 0, null, null, 'OUT_OF_STOCK', '{"usefulLifeLabel":"2 meses","standardQuantity":4,"usefulLifeMonths":2,"contents":["4 lápices por kit operacional"]}'),
  ('double-sided-tape', 'Cinta doble contacto', 'Proveedor BOOMBOX', 2000, true, 'MONTH', 2, 'MONTHLY_AMORTIZATION', 'ACTIVE', 0, null, null, 'OUT_OF_STOCK', '{"usefulLifeLabel":"2 meses","standardQuantity":1,"usefulLifeMonths":2}')
on conflict (catalog_code) do nothing;

commit;

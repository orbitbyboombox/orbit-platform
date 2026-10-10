-- Additive warehouse paper ledger. Does not touch existing CAJAS balances or historical event costs.
-- Run only after production backup, schema review and deployment approval.
create table if not exists public.paper_warehouse_balances (
  sku text not null,
  location text not null,
  quantity bigint not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (sku, location),
  constraint paper_warehouse_balances_location_check
    check (location = 'warehouse' or location ~ '^box:[a-zA-Z0-9_-]+$'),
  constraint paper_warehouse_balances_sku_check
    check (sku in ('PHOTO_10X15_NORMAL','PHOTO_10X15_PRECUT','PHOTO_5X15','PHOTO_7_5X10'))
);

create table if not exists public.paper_warehouse_movements (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  sku text not null check (sku in ('PHOTO_10X15_NORMAL','PHOTO_10X15_PRECUT','PHOTO_5X15','PHOTO_7_5X10')),
  kind text not null check (kind in ('opening','purchase','transfer','return','consumption','adjustment')),
  quantity bigint not null check (quantity > 0),
  from_location text,
  to_location text,
  orbit_event_id text,
  reason text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint paper_warehouse_movements_location_check
    check ((from_location is not null or to_location is not null)
      and from_location is distinct from to_location
      and (from_location is null or from_location = 'warehouse' or from_location ~ '^box:[a-zA-Z0-9_-]+$')
      and (to_location is null or to_location = 'warehouse' or to_location ~ '^box:[a-zA-Z0-9_-]+$')),
  constraint paper_warehouse_movements_direction_check check (
    (kind in ('opening','purchase') and from_location is null and to_location = 'warehouse')
    or (kind = 'transfer' and from_location = 'warehouse' and to_location like 'box:%')
    or (kind = 'return' and from_location like 'box:%' and to_location = 'warehouse')
    or (kind = 'consumption' and from_location like 'box:%' and to_location is null and orbit_event_id is not null)
    or (kind = 'adjustment' and ((from_location is null) <> (to_location is null)))
  )
);
create index if not exists paper_warehouse_movements_recent_idx
  on public.paper_warehouse_movements (created_at desc);

alter table public.paper_warehouse_balances enable row level security;
alter table public.paper_warehouse_movements enable row level security;

-- No direct client writes; all writes go through the transaction-safe RPC.
revoke all on public.paper_warehouse_balances from anon, authenticated;
revoke all on public.paper_warehouse_movements from anon, authenticated;
grant select on public.paper_warehouse_balances to authenticated;
grant select on public.paper_warehouse_movements to authenticated;

create policy paper_warehouse_balances_admin_read on public.paper_warehouse_balances
for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('CEO','ADMINISTRATOR'))
);
create policy paper_warehouse_movements_admin_read on public.paper_warehouse_movements
for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('CEO','ADMINISTRATOR'))
);

create or replace function public.record_paper_warehouse_movement(
  p_idempotency_key text,
  p_sku text,
  p_kind text,
  p_quantity bigint,
  p_from_location text default null,
  p_to_location text default null,
  p_orbit_event_id text default null,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_user uuid := auth.uid();
  v_current bigint;
begin
  if v_user is null or not exists (
    select 1 from public.profiles p where p.id = v_user and p.role in ('CEO','ADMINISTRATOR')
  ) then raise exception 'Permission denied' using errcode = '42501'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then raise exception 'Idempotency key required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
  if p_sku not in ('PHOTO_10X15_NORMAL','PHOTO_10X15_PRECUT','PHOTO_5X15','PHOTO_7_5X10') then raise exception 'Invalid SKU'; end if;
  if not (
    (p_kind in ('opening','purchase') and p_from_location is null and p_to_location = 'warehouse')
    or (p_kind = 'transfer' and p_from_location = 'warehouse' and p_to_location ~ '^box:[a-zA-Z0-9_-]+$')
    or (p_kind = 'return' and p_from_location ~ '^box:[a-zA-Z0-9_-]+$' and p_to_location = 'warehouse')
    or (p_kind = 'consumption' and p_from_location ~ '^box:[a-zA-Z0-9_-]+$' and p_to_location is null and p_orbit_event_id is not null)
    or (p_kind = 'adjustment' and ((p_from_location is null) <> (p_to_location is null))
        and coalesce(p_from_location, p_to_location) ~ '^(warehouse|box:[a-zA-Z0-9_-]+)$')
  ) then raise exception 'Invalid movement direction'; end if;

  -- Serialize all writes for one SKU, including retries, to avoid races and deadlocks.
  perform pg_advisory_xact_lock(hashtextextended('paper_warehouse:' || p_sku, 0));
  select m.id into v_id from public.paper_warehouse_movements m where m.idempotency_key = p_idempotency_key;
  if v_id is not null then
    if not exists (
      select 1 from public.paper_warehouse_movements m
      where m.id = v_id and m.sku = p_sku and m.kind = p_kind and m.quantity = p_quantity
        and m.from_location is not distinct from p_from_location
        and m.to_location is not distinct from p_to_location
        and m.orbit_event_id is not distinct from p_orbit_event_id
    ) then raise exception 'Idempotency key reused with different movement'; end if;
    return v_id;
  end if;

  if p_from_location is not null then
    select b.quantity into v_current from public.paper_warehouse_balances b
      where b.sku = p_sku and b.location = p_from_location for update;
    if coalesce(v_current, 0) < p_quantity then raise exception 'Insufficient paper stock'; end if;
    update public.paper_warehouse_balances set quantity = quantity - p_quantity, updated_at = now()
      where sku = p_sku and location = p_from_location;
  end if;
  if p_to_location is not null then
    insert into public.paper_warehouse_balances (sku, location, quantity)
      values (p_sku, p_to_location, p_quantity)
      on conflict (sku, location) do update
        set quantity = public.paper_warehouse_balances.quantity + excluded.quantity, updated_at = now();
  end if;
  insert into public.paper_warehouse_movements
    (idempotency_key,sku,kind,quantity,from_location,to_location,orbit_event_id,reason,created_by)
  values (p_idempotency_key,p_sku,p_kind,p_quantity,p_from_location,p_to_location,p_orbit_event_id,p_reason,v_user)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_paper_warehouse_movement(text,text,text,bigint,text,text,text,text) from public, anon;
grant execute on function public.record_paper_warehouse_movement(text,text,text,bigint,text,text,text,text) to authenticated;

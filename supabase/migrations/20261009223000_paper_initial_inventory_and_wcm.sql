begin;
do $$
declare v_supply uuid; v_actor uuid; v_current numeric;
begin
 select id,current_stock into v_supply,v_current from public.supplies where catalog_code='dnp-rx1-media' and deleted_at is null for update;
 select id into v_actor from auth.users where email='matias@boom-box.cl';
 if v_supply is null or v_actor is null then raise exception 'Insumo o fundador no encontrado'; end if;
 if v_current <> 0 or exists(select 1 from public.paper_warehouse_receipts where supply_id=v_supply) or exists(select 1 from public.paper_warehouse_transfers where supply_id=v_supply) then raise exception 'Inventario ya iniciado: conciliación manual requerida, no duplicar stock'; end if;
 update public.supplies set current_stock=18900,updated_by=v_actor where id=v_supply;
 insert into public.paper_warehouse_receipts(supply_id,quantity,stock_before,stock_after,reference,unit_cost,idempotency_key,created_by)
 values
 (v_supply,16800,0,16800,'Inventario inicial: factura Bravo Soluciones SpA 4379 de 09-10-2026; 12 kits DNP RX1 4x6, 2 parejas por kit, 700 impresiones por pareja',218629.0/1400,'e781ca7c-238e-4c44-92ac-91c1c52cde01',v_actor),
 (v_supply,2100,16800,18900,'Inventario inicial: sobrantes de compras anteriores confirmados por fundador; 1 kit completo + 1 pareja suelta, costo histórico no documentado',null,'e781ca7c-238e-4c44-92ac-91c1c52cde02',v_actor);
end $$;
create table if not exists public.paper_inventory_equipment_purchases(
 id uuid primary key default gen_random_uuid(),
 item_name text not null,
 quantity integer not null check(quantity>0),
 unit_cost_net numeric(14,2) not null check(unit_cost_net>=0),
 supplier text not null,
 invoice_number text not null,
 invoice_date date not null,
 notes text,
 created_at timestamptz not null default now()
);
alter table public.paper_inventory_equipment_purchases enable row level security;
drop policy if exists paper_inventory_equipment_admin_read on public.paper_inventory_equipment_purchases;
create policy paper_inventory_equipment_admin_read on public.paper_inventory_equipment_purchases for select to authenticated using(public.can_administer());
grant select on public.paper_inventory_equipment_purchases to authenticated;
insert into public.paper_inventory_equipment_purchases(id,item_name,quantity,unit_cost_net,supplier,invoice_number,invoice_date,notes)
values('cbec6c24-bb92-46be-9af6-6d16b7b5d11c','WCM Plus · módulo de conexión inalámbrica DNP',1,65528,'Bravo Soluciones SpA','4379','2026-10-09','Equipo adicional; no consumible, no afecta costo por impresión')
on conflict(id) do nothing;
commit;
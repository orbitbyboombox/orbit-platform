begin;
create table if not exists public.paper_warehouse_receipts (
 id uuid primary key default gen_random_uuid(),
 supply_id uuid not null references public.supplies(id),
 quantity integer not null check(quantity>0),
 stock_before numeric not null,
 stock_after numeric not null,
 reference text not null,
 unit_cost numeric,
 idempotency_key uuid not null unique,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.paper_warehouse_receipts enable row level security;
drop policy if exists paper_warehouse_receipts_admin_read on public.paper_warehouse_receipts;
create policy paper_warehouse_receipts_admin_read on public.paper_warehouse_receipts for select to authenticated using(public.can_administer());
grant select on public.paper_warehouse_receipts to authenticated;
create or replace function public.receive_warehouse_paper(p_supply_id uuid,p_quantity integer,p_reference text,p_unit_cost numeric,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_supply public.supplies%rowtype; v_receipt public.paper_warehouse_receipts%rowtype; v_actor uuid;
begin
 v_actor:=auth.uid();
 if v_actor is null or not exists(select 1 from public.profiles where id=v_actor and role in('CEO','ADMINISTRATOR')) then raise exception 'Acceso restringido a administración.'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>1000000 or p_idempotency_key is null or length(trim(coalesce(p_reference,'')))<4 or (p_unit_cost is not null and p_unit_cost<0) then raise exception 'Datos de ingreso inválidos.'; end if;
 select * into v_receipt from public.paper_warehouse_receipts where idempotency_key=p_idempotency_key;
 if found then
  if v_receipt.supply_id<>p_supply_id or v_receipt.quantity<>p_quantity then raise exception 'Identificador reutilizado con otros datos.'; end if;
  return jsonb_build_object('ok',true,'duplicate',true,'stock_after',v_receipt.stock_after);
 end if;
 select * into v_supply from public.supplies where id=p_supply_id and deleted_at is null for update;
 if not found or v_supply.catalog_code is distinct from 'dnp-rx1-media' or v_supply.unit is distinct from 'PHOTO' then raise exception 'Insumo de papel no permitido.'; end if;
 update public.supplies set current_stock=coalesce(v_supply.current_stock,0)+p_quantity,updated_by=v_actor where id=v_supply.id;
 insert into public.paper_warehouse_receipts(supply_id,quantity,stock_before,stock_after,reference,unit_cost,idempotency_key,created_by)
 values(v_supply.id,p_quantity,coalesce(v_supply.current_stock,0),coalesce(v_supply.current_stock,0)+p_quantity,trim(p_reference),p_unit_cost,p_idempotency_key,v_actor);
 return jsonb_build_object('ok',true,'duplicate',false,'stock_after',coalesce(v_supply.current_stock,0)+p_quantity);
end $$;
revoke all on function public.receive_warehouse_paper(uuid,integer,text,numeric,uuid) from public;
grant execute on function public.receive_warehouse_paper(uuid,integer,text,numeric,uuid) to authenticated;
commit;
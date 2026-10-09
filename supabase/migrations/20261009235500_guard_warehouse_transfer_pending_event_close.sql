begin;
-- Guard physical stock integrity: never silently invalidate an event's
-- opening snapshot when loading paper into the same CASE.
create or replace function public.transfer_warehouse_paper_to_box(p_supply_id uuid,p_box_asset_id uuid,p_quantity integer,p_reason text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_supply public.supplies%rowtype; v_box public.operational_assets%rowtype; v_before integer; v_transfer public.paper_warehouse_transfers%rowtype; v_actor uuid;
begin
 v_actor := auth.uid();
 if v_actor is null or not exists(select 1 from public.profiles where id=v_actor and role in ('CEO','ADMINISTRATOR')) then raise exception 'Acceso restringido a administración.'; end if;
 if p_quantity is null or p_quantity <= 0 or p_quantity > 100000 or mod(p_quantity,700) <> 0 or p_idempotency_key is null or length(trim(coalesce(p_reason,''))) < 4 then raise exception 'Cantidad, motivo o identificador inválido.'; end if;
 select * into v_transfer from public.paper_warehouse_transfers where idempotency_key=p_idempotency_key;
 if found then
   if v_transfer.supply_id<>p_supply_id or v_transfer.box_asset_id<>p_box_asset_id or v_transfer.quantity<>p_quantity then raise exception 'Clave de operación reutilizada con otros datos.'; end if;
   return jsonb_build_object('ok',true,'duplicate',true,'warehouse_after',v_transfer.warehouse_after,'box_after',v_transfer.box_after);
 end if;
 select * into v_supply from public.supplies where id=p_supply_id and deleted_at is null for update;
 if not found or v_supply.catalog_code is distinct from 'dnp-rx1-media' or v_supply.unit is distinct from 'PHOTO' then raise exception 'Solo se admiten insumos DNP RX1 medidos en impresiones.'; end if;
 if v_supply.current_stock < p_quantity then raise exception 'No hay suficiente papel en bodega.'; end if;
 select * into v_box from public.operational_assets where id=p_box_asset_id and asset_type='CASE' and asset_code between 'CASE-01' and 'CASE-09' and deleted_at is null for update;
 if not found then raise exception 'Caja inválida.'; end if;
 -- Pending event snapshots have captured a fixed opening balance. Require
 -- reconciliation through the existing event paper workflow before transfer.
 if exists(select 1 from public.event_paper_snapshots eps where eps.box_asset_id=v_box.id and eps.status='PENDING' and eps.paper_required=true and eps.final_remaining_balance is null) then
   raise exception 'La caja tiene un cierre de papel pendiente. Regulariza el evento antes de cargar un kit desde Bodega.';
 end if;
 v_before := coalesce((v_box.metadata->>'blackBoxPhotoStock')::integer,0);
 if v_before<0 then raise exception 'Stock de caja inválido.'; end if;
 update public.supplies set current_stock=v_supply.current_stock-p_quantity,updated_by=v_actor where id=v_supply.id;
 update public.operational_assets set metadata=jsonb_set(coalesce(v_box.metadata,'{}'::jsonb),'{blackBoxPhotoStock}',to_jsonb(v_before+p_quantity)),updated_by=v_actor where id=v_box.id;
 insert into public.paper_warehouse_transfers(supply_id,box_asset_id,quantity,warehouse_before,warehouse_after,box_before,box_after,reason,idempotency_key,created_by)
 values(v_supply.id,v_box.id,p_quantity,v_supply.current_stock,v_supply.current_stock-p_quantity,v_before,v_before+p_quantity,trim(p_reason),p_idempotency_key,v_actor);
 return jsonb_build_object('ok',true,'duplicate',false,'warehouse_after',v_supply.current_stock-p_quantity,'box_after',v_before+p_quantity);
end $$;
commit;
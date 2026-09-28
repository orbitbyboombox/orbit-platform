begin;

-- Keep the financial constraint strict: post-send price changes require a
-- human reason, persisted on both the quotation and its immutable version.
create or replace function public._save_commercial_quote_draft_core(
  p_actor uuid,
  p_actor_type text,
  p_actor_id text,
  p_quotation_id uuid,
  p_quote jsonb,
  p_items jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  item jsonb; q public.quotations%rowtype; quotation_number_value text;
  operation_value text; issue_date_value date; subtotal_value numeric;
  discount_value numeric; tax_value numeric; grand_total_value numeric;
  deposit_percent_value numeric; validity_days_value integer; next_version integer;
  previous_version_id uuid; new_version_id uuid := null;
  customer_snapshot_value jsonb := coalesce(p_quote->'customerSnapshot','{}'::jsonb);
  commercial_snapshot_value jsonb := coalesce(p_quote->'commercialSnapshot','{}'::jsonb);
  financial_snapshot_value jsonb; reason_value text;
begin
  if p_actor_type = 'HUMAN' then
    if p_actor is null or not public.can_manage_commercial() then raise exception 'Acceso comercial requerido.' using errcode='42501'; end if;
  elsif p_actor_type = 'SYSTEM_AGENT' then
    if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' or p_actor_id <> 'BIANCA' or p_actor is not null then raise exception 'Actor BIANCA no autorizado.' using errcode='42501'; end if;
  else raise exception 'Tipo de actor no autorizado.' using errcode='42501'; end if;
  if p_quotation_id is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'La cotización requiere al menos un ítem.' using errcode='22023'; end if;

  subtotal_value:=(p_quote->>'subtotal')::numeric; discount_value:=(p_quote->>'discountTotal')::numeric;
  tax_value:=(p_quote->>'taxTotal')::numeric; grand_total_value:=(p_quote->>'grandTotal')::numeric;
  deposit_percent_value:=(p_quote->>'depositPercent')::numeric; validity_days_value:=(p_quote->>'validityDays')::integer;
  issue_date_value:=coalesce(nullif(p_quote->>'issueDate','')::date,(current_timestamp at time zone 'America/Santiago')::date);
  reason_value:=nullif(trim(coalesce(p_quote->>'changeReason','')),'');
  if subtotal_value<0 or discount_value<0 or discount_value>subtotal_value or tax_value<0 or grand_total_value<>subtotal_value-discount_value+tax_value or deposit_percent_value<0 or deposit_percent_value>100 or validity_days_value<1 or validity_days_value>365 then raise exception 'Los totales o parámetros de la cotización no son consistentes.' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_quotation_id::text,0));
  select * into q from public.quotations where id=p_quotation_id and deleted_at is null for update;
  financial_snapshot_value:=jsonb_build_object('subtotal',subtotal_value,'discount',discount_value,'net',subtotal_value-discount_value,'tax',tax_value,'total',grand_total_value,'depositPercent',deposit_percent_value,'deposit',round(grand_total_value*deposit_percent_value/100),'balance',grand_total_value-round(grand_total_value*deposit_percent_value/100));

  if not found then
    quotation_number_value:=public.allocate_quotation_number(p_quotation_id,issue_date_value);
    insert into public.quotations(id,quotation_number,customer_id,project_id,orbit_event_id,status,customer_type,event_type,issue_date,expiration_date,currency,subtotal,transport_total,discount_total,tax_total,grand_total,official_price,final_customer_price,price_difference,customer_snapshot,commercial_snapshot,pricing_snapshot,validity_days,deposit_percent,global_discount_type,global_discount_value,blockers,created_by,updated_by)
    values(p_quotation_id,quotation_number_value,nullif(p_quote->>'customerId','')::uuid,null,null,'DRAFT','COMPANY','CORPORATE',issue_date_value,(p_quote->>'expirationDate')::date,'CLP',subtotal_value,0,discount_value,tax_value,grand_total_value,grand_total_value,grand_total_value,0,customer_snapshot_value,commercial_snapshot_value,commercial_snapshot_value,validity_days_value,nullif(p_quote->>'depositPercent','')::numeric,nullif(p_quote->>'globalDiscountType',''),(p_quote->>'globalDiscountValue')::numeric,'[]'::jsonb,p_actor,p_actor);
    operation_value:='CREATED'; q.id:=p_quotation_id; q.version:=0; q.status:='DRAFT';
  elsif q.status='ACCEPTED' or q.status='CONVERTED' then raise exception 'La cotización ya fue aceptada; crea una revisión post-aceptación explícita.' using errcode='55000';
  else
    operation_value:='UPDATED';
    if q.status<>'DRAFT' and grand_total_value<>coalesce(q.official_price,grand_total_value) and reason_value is null then raise exception 'El cambio de precio requiere un motivo de negociación.' using errcode='22023'; end if;
  end if;

  next_version:=greatest(coalesce(q.version,0)+1,1);
  if q.id is not null and q.version>0 and q.status<>'DRAFT' then
    insert into public.quote_versions(quote_id,version_number,status,customer_snapshot,commercial_snapshot,items_snapshot,financial_snapshot,pdf_storage_path,drive_file_id,created_by,created_at,sent_at,sent_by,accepted_at,accepted_by,change_reason)
    select q.id,q.version,q.status,coalesce(q.customer_snapshot,'{}'::jsonb),coalesce(q.commercial_snapshot,'{}'::jsonb),coalesce((select jsonb_agg(to_jsonb(i) order by i.display_order,i.id) from public.quotation_items i where i.quotation_id=q.id),'[]'::jsonb),jsonb_build_object('subtotal',q.subtotal,'discount',q.discount_total,'net',q.subtotal-q.discount_total,'tax',q.tax_total,'total',q.grand_total),q.pdf_storage_path,q.drive_file_id,q.updated_by,q.updated_at,q.approved_at,q.approved_by,q.approved_at,q.approved_by,coalesce(q.last_change_reason,'Versión anterior preservada') returning id into previous_version_id;
  end if;

  update public.quotations set customer_id=nullif(p_quote->>'customerId','')::uuid,customer_snapshot=customer_snapshot_value,commercial_snapshot=commercial_snapshot_value,pricing_snapshot=commercial_snapshot_value,expiration_date=(p_quote->>'expirationDate')::date,subtotal=subtotal_value,transport_total=0,discount_total=discount_value,tax_total=tax_value,grand_total=grand_total_value,official_price=case when q.status='DRAFT' then grand_total_value else official_price end,final_customer_price=grand_total_value,price_difference=case when q.status='DRAFT' then 0 else grand_total_value-coalesce(official_price,grand_total_value) end,negotiation_reason=case when q.status<>'DRAFT' and grand_total_value<>coalesce(official_price,grand_total_value) then reason_value else null end,last_change_reason=case when q.status<>'DRAFT' then coalesce(reason_value,last_change_reason) else last_change_reason end,validity_days=validity_days_value,deposit_percent=deposit_percent_value,global_discount_type=nullif(p_quote->>'globalDiscountType',''),global_discount_value=(p_quote->>'globalDiscountValue')::numeric,status=case when q.status='DRAFT' then 'DRAFT' else 'NEGOTIATION' end,version=next_version,updated_by=p_actor,updated_at=now(),current_version_id=null where id=p_quotation_id;
  delete from public.quotation_items where quotation_id=p_quotation_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.quotation_items(quotation_id,item_type,code,label,description,quantity,unit_price,total,official_unit_price,official_total,final_unit_price,final_total,catalog_price,quoted_price,discount_type,discount_value,display_order,is_manual,metadata)
    values(p_quotation_id,item->>'itemType',item->>'code',item->>'description',item->>'description',(item->>'quantity')::numeric,(item->>'quotedPrice')::numeric,(item->>'total')::numeric,coalesce((item->>'catalogPrice')::numeric,(item->>'quotedPrice')::numeric),coalesce((item->>'catalogPrice')::numeric,(item->>'quotedPrice')::numeric)*(item->>'quantity')::numeric,(item->>'quotedPrice')::numeric,(item->>'total')::numeric,(item->>'catalogPrice')::numeric,(item->>'quotedPrice')::numeric,nullif(item->>'discountType',''),(item->>'discountValue')::numeric,(item->>'displayOrder')::integer,(item->>'manual')::boolean,coalesce(item->'metadata','{}'::jsonb));
  end loop;
  if q.status='DRAFT' and q.current_version_id is not null then
    update public.quote_versions set customer_snapshot=customer_snapshot_value,commercial_snapshot=commercial_snapshot_value,items_snapshot=p_items,financial_snapshot=financial_snapshot_value,change_reason=reason_value,created_by=coalesce(created_by,p_actor) where id=q.current_version_id returning id into new_version_id;
  end if;
  if new_version_id is null then
    insert into public.quote_versions(quote_id,version_number,status,customer_snapshot,commercial_snapshot,items_snapshot,financial_snapshot,supersedes_version_id,change_reason,created_by) values(p_quotation_id,next_version,case when q.status='DRAFT' then 'DRAFT' else 'NEGOTIATION' end,customer_snapshot_value,commercial_snapshot_value,p_items,financial_snapshot_value,previous_version_id,reason_value,p_actor) returning id into new_version_id;
  end if;
  update public.quotations set current_version_id=new_version_id where id=p_quotation_id;
  return jsonb_build_object('quotationId',p_quotation_id,'quotationNumber',coalesce(quotation_number_value,q.quotation_number),'operation',operation_value,'version',next_version);
end;
$$;

revoke all on function public._save_commercial_quote_draft_core(uuid,text,text,uuid,jsonb,jsonb) from public,anon,authenticated;
commit;

begin;

-- One persistence core for HUMAN and BIANCA. The public wrappers only resolve
-- and authorize the actor; pricing, numbering and draft persistence remain in
-- this single domain function.
create or replace function public._save_commercial_quote_draft_core(
  p_actor uuid,
  p_actor_type text,
  p_actor_id text,
  p_quotation_id uuid,
  p_quote jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  existing_status text;
  quotation_number_value text;
  operation_value text;
  issue_date_value date;
  subtotal_value numeric;
  discount_value numeric;
  tax_value numeric;
  grand_total_value numeric;
  deposit_percent_value numeric;
  validity_days_value integer;
begin
  if p_actor_type = 'HUMAN' then
    if p_actor is null or not public.can_manage_commercial() then
      raise exception 'Acceso comercial requerido.' using errcode = '42501';
    end if;
  elsif p_actor_type = 'SYSTEM_AGENT' then
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
      or p_actor_id <> 'BIANCA'
      or p_actor is not null then
      raise exception 'Actor BIANCA no autorizado.' using errcode = '42501';
    end if;
  else
    raise exception 'Tipo de actor no autorizado.' using errcode = '42501';
  end if;

  if p_quotation_id is null then
    raise exception 'quotation_id is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización requiere al menos un ítem.' using errcode = '22023';
  end if;

  subtotal_value := (p_quote ->> 'subtotal')::numeric;
  discount_value := (p_quote ->> 'discountTotal')::numeric;
  tax_value := (p_quote ->> 'taxTotal')::numeric;
  grand_total_value := (p_quote ->> 'grandTotal')::numeric;
  deposit_percent_value := (p_quote ->> 'depositPercent')::numeric;
  validity_days_value := (p_quote ->> 'validityDays')::integer;
  issue_date_value := coalesce(nullif(p_quote ->> 'issueDate', '')::date, (current_timestamp at time zone 'America/Santiago')::date);

  if subtotal_value < 0 or discount_value < 0 or discount_value > subtotal_value
    or tax_value < 0 or grand_total_value <> subtotal_value - discount_value + tax_value then
    raise exception 'Los totales de la cotización no son consistentes.' using errcode = '22023';
  end if;
  if deposit_percent_value < 0 or deposit_percent_value > 100 then
    raise exception 'El porcentaje de abono debe estar entre 0 y 100.' using errcode = '22023';
  end if;
  if validity_days_value < 1 or validity_days_value > 365 then
    raise exception 'La vigencia debe estar entre 1 y 365 días.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_quotation_id::text, 0));
  select q.status, q.quotation_number into existing_status, quotation_number_value
  from public.quotations q where q.id = p_quotation_id and q.deleted_at is null for update;

  if found then
    if existing_status <> 'DRAFT' then
      raise exception 'Solo un borrador puede editarse.' using errcode = '55000';
    end if;
    update public.quotations set
      customer_id = nullif(p_quote ->> 'customerId', '')::uuid,
      customer_snapshot = p_quote -> 'customerSnapshot',
      commercial_snapshot = p_quote -> 'commercialSnapshot',
      pricing_snapshot = p_quote -> 'commercialSnapshot',
      expiration_date = (p_quote ->> 'expirationDate')::date,
      subtotal = subtotal_value, transport_total = 0, discount_total = discount_value,
      tax_total = tax_value, grand_total = grand_total_value,
      official_price = grand_total_value, final_customer_price = grand_total_value,
      price_difference = 0, validity_days = validity_days_value,
      deposit_percent = deposit_percent_value,
      global_discount_type = nullif(p_quote ->> 'globalDiscountType', ''),
      global_discount_value = (p_quote ->> 'globalDiscountValue')::numeric,
      updated_by = p_actor, updated_at = now()
    where id = p_quotation_id;
    operation_value := 'UPDATED';
  else
    quotation_number_value := public.allocate_quotation_number(p_quotation_id, issue_date_value);
    insert into public.quotations (
      id, quotation_number, customer_id, project_id, orbit_event_id, status,
      customer_type, event_type, issue_date, expiration_date, currency,
      subtotal, transport_total, discount_total, tax_total, grand_total,
      official_price, final_customer_price, price_difference,
      customer_snapshot, commercial_snapshot, pricing_snapshot,
      validity_days, deposit_percent, global_discount_type, global_discount_value,
      blockers, created_by, updated_by
    ) values (
      p_quotation_id, quotation_number_value,
      nullif(p_quote ->> 'customerId', '')::uuid, null, null, 'DRAFT',
      'COMPANY', 'CORPORATE', issue_date_value,
      (p_quote ->> 'expirationDate')::date, 'CLP', subtotal_value, 0,
      discount_value, tax_value, grand_total_value, grand_total_value,
      grand_total_value, 0, p_quote -> 'customerSnapshot',
      p_quote -> 'commercialSnapshot', p_quote -> 'commercialSnapshot',
      validity_days_value, deposit_percent_value,
      nullif(p_quote ->> 'globalDiscountType', ''),
      (p_quote ->> 'globalDiscountValue')::numeric, '[]'::jsonb, p_actor, p_actor
    );
    operation_value := 'CREATED';
  end if;

  delete from public.quotation_items where quotation_id = p_quotation_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.quotation_items (
      quotation_id, item_type, code, label, description, quantity,
      unit_price, total, official_unit_price, official_total,
      final_unit_price, final_total, catalog_price, quoted_price,
      discount_type, discount_value, display_order, is_manual, metadata
    ) values (
      p_quotation_id, item ->> 'itemType', item ->> 'code',
      item ->> 'description', item ->> 'description',
      (item ->> 'quantity')::numeric, (item ->> 'quotedPrice')::numeric,
      (item ->> 'total')::numeric,
      coalesce((item ->> 'catalogPrice')::numeric, (item ->> 'quotedPrice')::numeric),
      coalesce((item ->> 'catalogPrice')::numeric, (item ->> 'quotedPrice')::numeric) * (item ->> 'quantity')::numeric,
      (item ->> 'quotedPrice')::numeric, (item ->> 'total')::numeric,
      (item ->> 'catalogPrice')::numeric, (item ->> 'quotedPrice')::numeric,
      nullif(item ->> 'discountType', ''), (item ->> 'discountValue')::numeric,
      (item ->> 'displayOrder')::integer, (item ->> 'manual')::boolean,
      coalesce(item -> 'metadata', '{}'::jsonb)
    );
  end loop;

  return jsonb_build_object('quotationId', p_quotation_id, 'quotationNumber', quotation_number_value, 'operation', operation_value);
end;
$$;

-- Preserve the existing HUMAN contract and session authorization.
create or replace function public.save_commercial_quote_draft(
  p_quotation_id uuid, p_quote jsonb, p_items jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public._save_commercial_quote_draft_core(auth.uid(), 'HUMAN', auth.uid()::text, p_quotation_id, p_quote, p_items);
end;
$$;

-- Narrow backend capability: service_role can call this function, but only with
-- the fixed technical identity and only for quote creation/update.
create or replace function public.save_bianca_commercial_quote_draft(
  p_actor_id text, p_quotation_id uuid, p_quote jsonb, p_items jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Backend autorizado requerido.' using errcode = '42501';
  end if;
  if p_actor_id <> 'BIANCA' then
    raise exception 'Actor BIANCA no autorizado.' using errcode = '42501';
  end if;
  return public._save_commercial_quote_draft_core(null, 'SYSTEM_AGENT', p_actor_id, p_quotation_id, p_quote, p_items);
end;
$$;

revoke all on function public._save_commercial_quote_draft_core(uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.save_bianca_commercial_quote_draft(text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_bianca_commercial_quote_draft(text, uuid, jsonb, jsonb) to service_role;

comment on function public._save_commercial_quote_draft_core(uuid, text, text, uuid, jsonb, jsonb) is 'Single canonical quote draft domain core for HUMAN and SYSTEM_AGENT actors.';
comment on function public.save_bianca_commercial_quote_draft(text, uuid, jsonb, jsonb) is 'Restricted CREATE_CANONICAL_QUOTE capability for the BIANCA backend actor.';

commit;

begin;

-- Safe commercial workflow extensions. These functions never touch projects,
-- payments, invoices, reservations or documents from the source quotation.
create or replace function public.prepare_commercial_quote_revision(
  p_quote_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  q public.quotations%rowtype;
  current_version public.quote_versions%rowtype;
  next_version integer;
  new_version_id uuid;
begin
  if actor is null or not public.can_manage_commercial() then
    raise exception 'Acceso comercial requerido.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'La modificación requiere un motivo.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quote_id::text, 0));
  select * into q from public.quotations
    where id = p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.status not in ('ACCEPTED', 'CONVERTED') then
    raise exception 'La cotización no requiere una revisión post-aceptación.' using errcode = '55000';
  end if;
  if q.current_version_id is null then
    perform public.ensure_current_quote_version(q.id, actor);
    select * into q from public.quotations where id = p_quote_id for update;
  end if;
  select * into current_version from public.quote_versions where id = q.current_version_id for update;
  next_version := greatest(coalesce(q.version, 0) + 1, 1);
  insert into public.quote_versions(
    quote_id, version_number, status, customer_snapshot, commercial_snapshot,
    items_snapshot, financial_snapshot, supersedes_version_id, change_reason, created_by
  ) values (
    q.id, next_version, 'NEGOTIATION', current_version.customer_snapshot,
    current_version.commercial_snapshot, current_version.items_snapshot,
    current_version.financial_snapshot, current_version.id, trim(p_reason), actor
  ) returning id into new_version_id;
  update public.quotations set
    status = 'NEGOTIATION', version = next_version, current_version_id = new_version_id,
    last_change_reason = trim(p_reason), updated_by = actor, updated_at = now()
    where id = q.id;
  return jsonb_build_object('status', 'NEGOTIATION', 'quoteId', q.id,
    'version', next_version, 'versionId', new_version_id,
    'acceptedVersionId', q.accepted_version_id, 'projectId', q.project_id);
end;
$$;

create table if not exists public.commercial_quote_duplication_requests (
  actor_id uuid not null,
  request_id uuid not null,
  payload_hash text not null,
  quotation_id uuid not null references public.quotations(id),
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
revoke all on public.commercial_quote_duplication_requests from public, anon, authenticated;

create or replace function public.duplicate_commercial_quote(
  p_source_quote_id uuid,
  p_customer_id uuid default null,
  p_event_overrides jsonb default '{}'::jsonb,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  source public.quotations%rowtype;
  new_id uuid := gen_random_uuid();
  new_number text;
  issue_date_value date := (current_timestamp at time zone 'America/Santiago')::date;
  expiration_date_value date;
  customer_snapshot_value jsonb;
  commercial_snapshot_value jsonb;
  financial_snapshot_value jsonb;
  new_version_id uuid;
  request_hash text;
  prior_request public.commercial_quote_duplication_requests%rowtype;
  prior_number text;
begin
  if actor is null or not public.can_manage_commercial() then
    raise exception 'Acceso comercial requerido.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Se requiere una clave de idempotencia.' using errcode = '22023';
  end if;
  request_hash := md5(jsonb_build_object('source', p_source_quote_id, 'customer', p_customer_id, 'event', p_event_overrides)::text);
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_id::text, 0));
  select * into prior_request from public.commercial_quote_duplication_requests
    where actor_id = actor and request_id = p_request_id;
  if found then
    if prior_request.payload_hash <> request_hash then
      raise exception 'Clave de operación reutilizada con datos diferentes.' using errcode = '22023';
    end if;
    select quotation_number into prior_number from public.quotations where id = prior_request.quotation_id;
    return jsonb_build_object('quotationId', prior_request.quotation_id,
      'quotationNumber', prior_number, 'operation', 'ALREADY_DUPLICATED', 'sourceQuotationId', p_source_quote_id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_source_quote_id::text, 0));
  select * into source from public.quotations
    where id = p_source_quote_id and deleted_at is null for share;
  if not found then raise exception 'Cotización de origen no encontrada.'; end if;
  new_number := public.allocate_quotation_number(new_id, issue_date_value);
  expiration_date_value := issue_date_value + greatest(coalesce(source.validity_days, 10), 1);
  customer_snapshot_value := coalesce(source.customer_snapshot, '{}'::jsonb);
  if p_customer_id is not null then
    select jsonb_build_object(
      'company', coalesce(c.company, c.full_name), 'rut', c.rut,
      'contact', c.full_name, 'email', c.email,
      'secondaryEmail', c.secondary_email, 'phone', c.phone, 'address', c.address
    ) into customer_snapshot_value
    from public.customers c where c.id = p_customer_id and c.deleted_at is null;
    if customer_snapshot_value is null then raise exception 'Cliente de destino no encontrado.'; end if;
  end if;
  commercial_snapshot_value := coalesce(source.commercial_snapshot, '{}'::jsonb)
    || jsonb_build_object('duplicatedFrom', jsonb_build_object('id', source.id,
      'number', source.quotation_number, 'version', source.version));
  if jsonb_typeof(p_event_overrides) = 'object' then
    commercial_snapshot_value := jsonb_set(commercial_snapshot_value, '{event}',
      coalesce(commercial_snapshot_value->'event', '{}'::jsonb) || p_event_overrides, true);
  end if;
  financial_snapshot_value := jsonb_build_object('subtotal', source.subtotal,
    'discount', source.discount_total, 'net', source.subtotal - source.discount_total,
    'tax', source.tax_total, 'total', source.grand_total,
    'depositPercent', source.deposit_percent,
    'deposit', round(source.grand_total * source.deposit_percent / 100),
    'balance', source.grand_total - round(source.grand_total * source.deposit_percent / 100));
  insert into public.quotations(
    id, quotation_number, customer_id, project_id, orbit_event_id, status,
    customer_type, event_type, issue_date, expiration_date, currency,
    subtotal, transport_total, discount_total, tax_total, grand_total,
    official_price, final_customer_price, price_difference, customer_snapshot,
    commercial_snapshot, pricing_snapshot, validity_days, deposit_percent,
    global_discount_type, global_discount_value, blockers, created_by, updated_by,
    version, last_change_reason
  ) values (
    new_id, new_number, p_customer_id, null, null, 'DRAFT', source.customer_type,
    source.event_type, issue_date_value, expiration_date_value, source.currency,
    source.subtotal, source.transport_total, source.discount_total, source.tax_total,
    source.grand_total, source.grand_total, source.grand_total, 0,
    customer_snapshot_value, commercial_snapshot_value, commercial_snapshot_value,
    source.validity_days, source.deposit_percent, source.global_discount_type,
    source.global_discount_value, '[]'::jsonb, actor, actor, 1,
    format('Creada como base desde %s.', source.quotation_number)
  );
  insert into public.quotation_items(
    quotation_id, item_type, code, label, description, quantity, unit_price, total,
    official_unit_price, official_total, final_unit_price, final_total,
    catalog_price, quoted_price, discount_type, discount_value, display_order,
    is_manual, metadata
  ) select new_id, item_type, code, label, description, quantity, unit_price, total,
    official_unit_price, official_total, final_unit_price, final_total,
    catalog_price, quoted_price, discount_type, discount_value, display_order,
    is_manual, metadata from public.quotation_items where quotation_id = source.id;
  insert into public.quote_versions(
    quote_id, version_number, status, customer_snapshot, commercial_snapshot,
    items_snapshot, financial_snapshot, change_reason, created_by
  ) select new_id, 1, 'DRAFT', customer_snapshot_value, commercial_snapshot_value,
    coalesce((select jsonb_agg(to_jsonb(i) order by i.display_order, i.id)
      from public.quotation_items i where i.quotation_id = new_id), '[]'::jsonb),
    financial_snapshot_value, format('Duplicada desde %s.', source.quotation_number), actor
  returning id into new_version_id;
  update public.quotations set current_version_id = new_version_id where id = new_id;
  insert into public.commercial_quote_duplication_requests(actor_id, request_id, payload_hash, quotation_id)
    values (actor, p_request_id, request_hash, new_id);
  return jsonb_build_object('quotationId', new_id, 'quotationNumber', new_number,
    'operation', 'DUPLICATED', 'sourceQuotationId', source.id);
end;
$$;

revoke all on function public.prepare_commercial_quote_revision(uuid, text) from public, anon;
grant execute on function public.prepare_commercial_quote_revision(uuid, text) to authenticated;
revoke all on function public.duplicate_commercial_quote(uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function public.duplicate_commercial_quote(uuid, uuid, jsonb, uuid) to authenticated;

commit;

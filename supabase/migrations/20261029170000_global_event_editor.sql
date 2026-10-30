begin;

-- Atomic boundary for the Founder event editor. It changes the current event
-- projection, while preserving accepted quotation versions and every payment
-- row. External integrations are deliberately handled by the server action
-- after this transaction commits.
create or replace function public.update_global_event_editor(
  p_project_id uuid,
  p_expected_version integer,
  p_changes jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  project_row public.projects%rowtype;
  quotation_row public.quotations%rowtype;
  invoice_row public.invoices%rowtype;
  service_row record;
  item_row record;
  before_items jsonb;
  before_financial jsonb;
  new_items jsonb := coalesce(p_changes->'items', '[]'::jsonb);
  services jsonb := coalesce(p_changes->'services', '[]'::jsonb);
  total_services numeric := 0;
  subtotal_value numeric := 0;
  discount_value numeric := greatest(0, coalesce((p_changes->>'discount')::numeric, 0));
  transport_value numeric := greatest(0, coalesce((p_changes->>'transport')::numeric, 0));
  vat_percent numeric := coalesce((p_changes->>'vatPercent')::numeric, 19);
  tax_value numeric := 0;
  total_value numeric := 0;
  paid_value numeric := 0;
  balance_value numeric := 0;
  next_version integer;
  previous_version_id uuid;
  new_quote_version_id uuid;
  service_count integer := 0;
  item_index integer := 0;
  has_services boolean := p_changes ? 'services';
  has_operational_changes boolean := (p_changes ? 'name')
    or (p_changes ? 'eventDate')
    or (p_changes ? 'eventTime')
    or (p_changes ? 'location')
    or (p_changes ? 'city')
    or (p_changes ? 'eventAddress')
    or (p_changes ? 'notes')
    or has_services
    or (p_changes ? 'serviceStartLocal')
    or (p_changes ? 'serviceEndLocal')
    or (p_changes ? 'staffCallLocal');
  changed_commercial boolean := jsonb_typeof(p_changes->'items') = 'array';
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede editar eventos.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'El motivo del cambio es obligatorio.' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'La versión del evento no es válida.' using errcode = '22023';
  end if;
  if has_services and jsonb_typeof(services) <> 'array' then
    raise exception 'La lista de servicios no es válida.' using errcode = '22023';
  end if;
  if changed_commercial and (jsonb_typeof(new_items) <> 'array' or jsonb_array_length(new_items) = 0) then
    raise exception 'La cotización requiere al menos una partida.' using errcode = '22023';
  end if;
  if vat_percent < 0 or vat_percent > 100 or discount_value < 0 or transport_value < 0 then
    raise exception 'Los valores comerciales no son válidos.' using errcode = '22023';
  end if;

  select * into project_row
  from public.projects
  where id = p_project_id and deleted_at is null
  for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  if coalesce(project_row.version, 0) <> p_expected_version then
    raise exception 'El evento cambió desde que abriste el editor. Actualiza la página.' using errcode = '40001';
  end if;

  select * into quotation_row
  from public.quotations
  where project_id = p_project_id and deleted_at is null
  order by created_at desc
  limit 1
  for update;

  if changed_commercial and quotation_row.id is null then
    raise exception 'El evento no tiene una cotización editable.' using errcode = '55000';
  end if;

  -- Replacing a service is explicit and safe: a removed service with active
  -- assignments is rejected instead of silently orphaning Staff work.
  if has_services then
    for service_row in
      select * from jsonb_to_recordset(services)
        as s(id uuid, code text, duration numeric, extras jsonb, removed boolean)
    loop
      if service_row.code is null or length(trim(service_row.code)) = 0 then
        raise exception 'Cada servicio debe tener un código.' using errcode = '22023';
      end if;
      if service_row.duration is null or service_row.duration <= 0 or service_row.duration > 24 then
        raise exception 'La duración de cada servicio debe estar entre 0 y 24 horas.' using errcode = '22023';
      end if;
      if coalesce(service_row.removed, false) then
        if service_row.id is null then continue; end if;
        if exists(select 1 from public.assignments a where a.project_id = p_project_id and a.deleted_at is null) then
          raise exception 'No se puede eliminar un servicio con asignaciones activas.' using errcode = '55000';
        end if;
        delete from public.project_services where id = service_row.id and project_id = p_project_id;
      elsif service_row.id is null then
        insert into public.project_services(project_id, service_code, duration_hours, extras)
        values(p_project_id, trim(service_row.code), service_row.duration, coalesce(service_row.extras, '[]'::jsonb));
      else
        update public.project_services
        set service_code = trim(service_row.code), duration_hours = service_row.duration,
            extras = coalesce(service_row.extras, '[]'::jsonb)
        where id = service_row.id and project_id = p_project_id;
        if not found then raise exception 'El servicio no pertenece a este evento.'; end if;
      end if;
      service_count := service_count + case when coalesce(service_row.removed, false) then 0 else 1 end;
    end loop;
    if service_count = 0 then raise exception 'El evento debe conservar al menos un servicio.'; end if;
  end if;

  if has_operational_changes then
    update public.projects set
      name = coalesce(nullif(trim(p_changes->>'name'), ''), name),
      event_date = coalesce(nullif(p_changes->>'eventDate', '')::date, event_date),
      event_time = coalesce(nullif(p_changes->>'eventTime', '')::time, event_time),
      location = coalesce(nullif(trim(p_changes->>'location'), ''), location),
      city = coalesce(nullif(trim(p_changes->>'city'), ''), city),
      operations = coalesce(operations, '{}'::jsonb)
        || case when p_changes ? 'eventAddress' then jsonb_build_object('eventAddress', trim(coalesce(p_changes->>'eventAddress', ''))) else '{}'::jsonb end
        || case when p_changes ? 'notes' then jsonb_build_object('notes', coalesce(p_changes->>'notes', '')) else '{}'::jsonb end,
      version = coalesce(version, 0) + 1,
      updated_by = actor,
      updated_at = now(),
      approval_reason = trim(p_reason)
    where id = p_project_id;
  end if;

  if has_operational_changes and p_changes ? 'serviceStartLocal' and p_changes ? 'serviceEndLocal' then
    perform public.update_event_service_schedule(
      p_project_id, p_changes->>'serviceStartLocal', p_changes->>'serviceEndLocal', nullif(p_changes->>'staffCallLocal', '')
    );
  end if;

  if changed_commercial then
    subtotal_value := 0;
    for item_row in
      select * from jsonb_to_recordset(new_items)
        as i(item_type text, code text, label text, quantity numeric, unit_price numeric, discount numeric)
    loop
      if item_row.label is null or length(trim(item_row.label)) = 0 or item_row.quantity is null or item_row.quantity <= 0
        or item_row.unit_price is null or item_row.unit_price < 0 then
        raise exception 'Cada partida debe tener descripción, cantidad y precio válidos.' using errcode = '22023';
      end if;
      subtotal_value := subtotal_value + round(item_row.quantity * item_row.unit_price, 2);
    end loop;
    if discount_value > subtotal_value then raise exception 'El descuento no puede superar el subtotal.' using errcode = '22023'; end if;
    tax_value := round((subtotal_value - discount_value + transport_value) * vat_percent / 100);
    total_value := subtotal_value - discount_value + transport_value + tax_value;
    if total_value < 0 then raise exception 'El total no puede ser negativo.' using errcode = '22023'; end if;

    select coalesce((select jsonb_agg(to_jsonb(i) order by i.display_order, i.id) from public.quotation_items i where i.quotation_id = quotation_row.id), '[]'::jsonb),
      jsonb_build_object('subtotal', quotation_row.subtotal, 'discount', quotation_row.discount_total, 'tax', quotation_row.tax_total, 'total', quotation_row.grand_total)
    into before_items, before_financial;
    next_version := greatest(coalesce(quotation_row.version, 0) + 1, 1);

    if quotation_row.status in ('ACCEPTED', 'CONVERTED') then
      previous_version_id := quotation_row.current_version_id;
      if previous_version_id is null then
        insert into public.quote_versions(quote_id, version_number, status, customer_snapshot, commercial_snapshot, items_snapshot, financial_snapshot, pdf_storage_path, drive_file_id, created_by, created_at, accepted_at, accepted_by, change_reason)
        values(quotation_row.id, greatest(coalesce(quotation_row.version, 1), 1), quotation_row.status, coalesce(quotation_row.customer_snapshot, '{}'::jsonb), coalesce(quotation_row.commercial_snapshot, '{}'::jsonb), before_items, before_financial, quotation_row.pdf_storage_path, quotation_row.drive_file_id, actor, now(), quotation_row.approved_at, quotation_row.approved_by, 'Versión anterior preservada antes de editar el evento')
        on conflict (quote_id, version_number) do nothing
        returning id into previous_version_id;
        if previous_version_id is null then
          select id into previous_version_id from public.quote_versions where quote_id = quotation_row.id and version_number = greatest(coalesce(quotation_row.version, 1), 1);
        end if;
      end if;
    end if;

    select * into invoice_row from public.invoices where project_id = p_project_id and deleted_at is null and status <> 'CANCELLED' order by created_at desc limit 1 for update;
    paid_value := coalesce(invoice_row.paid_amount, 0);
    if invoice_row.id is not null and (invoice_row.status = 'PAID' or invoice_row.closed_at is not null) and invoice_row.amount <> total_value then
      raise exception 'La factura está pagada o cerrada; no se puede cambiar su total.' using errcode = '55000';
    end if;
    if paid_value > total_value then raise exception 'El nuevo total no puede ser menor que los pagos históricos.' using errcode = '55000'; end if;

    update public.quotations set
      subtotal = subtotal_value, transport_total = transport_value, discount_total = discount_value,
      tax_total = tax_value, grand_total = total_value, final_customer_price = total_value,
      price_difference = case when status in ('ACCEPTED','CONVERTED') then total_value - coalesce(official_price, total_value) else 0 end,
      version = next_version, updated_by = actor, updated_at = now(), last_change_reason = trim(p_reason),
      current_version_id = null
    where id = quotation_row.id;

    delete from public.quotation_items where quotation_id = quotation_row.id;
    for item_row in select * from jsonb_to_recordset(new_items) as i(item_type text, code text, label text, quantity numeric, unit_price numeric, discount numeric) loop
      item_index := item_index + 1;
      insert into public.quotation_items(quotation_id, item_type, code, label, description, quantity, unit_price, total, official_unit_price, official_total, final_unit_price, final_total, catalog_price, quoted_price, discount_value, display_order, is_manual, metadata)
      values(quotation_row.id, coalesce(item_row.item_type, 'EXTRA'), nullif(item_row.code, ''), trim(item_row.label), trim(item_row.label), item_row.quantity, item_row.unit_price, round(item_row.quantity * item_row.unit_price, 2), item_row.unit_price, round(item_row.quantity * item_row.unit_price, 2), item_row.unit_price, round(item_row.quantity * item_row.unit_price, 2), item_row.unit_price, item_row.unit_price, coalesce(item_row.discount, 0), item_index, true, '{}'::jsonb);
    end loop;
    insert into public.quote_versions(quote_id, version_number, status, customer_snapshot, commercial_snapshot, items_snapshot, financial_snapshot, supersedes_version_id, change_reason, created_by)
    values(quotation_row.id, next_version, quotation_row.status, coalesce(quotation_row.customer_snapshot, '{}'::jsonb), coalesce(quotation_row.commercial_snapshot, '{}'::jsonb), new_items, jsonb_build_object('subtotal', subtotal_value, 'discount', discount_value, 'transport', transport_value, 'tax', tax_value, 'total', total_value, 'paid', paid_value, 'balance', greatest(total_value - paid_value, 0)), previous_version_id, trim(p_reason), actor)
    returning id into new_quote_version_id;
    update public.quotations set current_version_id = new_quote_version_id where id = quotation_row.id;
    if invoice_row.id is not null then
      update public.invoices set amount = total_value, updated_by = actor, approval_reason = trim(p_reason) where id = invoice_row.id;
    end if;
  end if;

  -- Return the persisted financial values for operational-only edits.
  -- No financial records are written or synchronized in this branch.
  if not changed_commercial then
    total_value := coalesce(quotation_row.grand_total, 0);
    select coalesce(i.paid_amount, 0) into paid_value
    from public.invoices i
    where i.project_id = p_project_id and i.deleted_at is null and i.status <> 'CANCELLED'
    order by i.created_at desc limit 1;
    paid_value := coalesce(paid_value, 0);
  end if;

  -- Operational-only edits must not recalculate or write financial projections.
  if changed_commercial then
    perform public.sync_estimated_cost_sheet(p_project_id);
    perform public.sync_financial_event(p_project_id);
    perform public.sync_event_operation_cost(p_project_id);
    perform public.sync_event_profitability(p_project_id);
  end if;

  insert into public.timeline_events(customer_id, project_id, orbit_event_id, event_type, title, description, actor_id, actor_label, source, action, entity_type, entity_id, human_message, correlation_id, reason, created_by)
  values(project_row.customer_id, p_project_id, project_row.orbit_event_id, 'GLOBAL_EVENT_UPDATED', 'Evento actualizado', jsonb_build_object('before', jsonb_build_object('name', project_row.name, 'eventDate', project_row.event_date, 'eventTime', project_row.event_time, 'location', project_row.location, 'city', project_row.city, 'items', before_items, 'financial', before_financial), 'after', p_changes, 'paymentsPreserved', true)::text, actor, 'Administrador', 'Administrator', 'GLOBAL_EVENT_UPDATED', 'Project', p_project_id, 'El evento fue actualizado con trazabilidad y sin eliminar pagos históricos.', 'global-event-editor:' || p_project_id::text || ':' || coalesce(project_row.version, 0)::text, trim(p_reason), actor);

  return jsonb_build_object('projectId', p_project_id, 'version', coalesce(project_row.version, 0) + case when has_operational_changes then 1 else 0 end, 'total', total_value, 'paid', paid_value, 'balance', greatest(total_value - paid_value, 0), 'quotationVersion', new_quote_version_id);
end;
$$;

revoke all on function public.update_global_event_editor(uuid, integer, jsonb, text) from public, anon;
grant execute on function public.update_global_event_editor(uuid, integer, jsonb, text) to authenticated;

commit;

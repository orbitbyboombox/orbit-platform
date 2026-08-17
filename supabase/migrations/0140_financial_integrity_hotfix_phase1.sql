begin;

-- Phase 1: canonical payment movement handling and financial integrity hardening
-- Scope: invoice payments -> receivable movements -> invoices -> documents.

alter table public.invoice_payments
  add column if not exists idempotency_key text,
  add column if not exists receipt_name text;

alter table public.receivable_movements
  add column if not exists idempotency_key text;

alter table public.documents
  add column if not exists invoice_id uuid references public.invoices(id),
  add column if not exists payment_id uuid references public.invoice_payments(id),
  add column if not exists orbit_event_id text,
  add column if not exists idempotency_key text;

create unique index if not exists invoice_payments_idempotency_uq
  on public.invoice_payments (invoice_id, idempotency_key)
  where idempotency_key is not null and deleted_at is null;

create unique index if not exists receivable_movements_idempotency_uq
  on public.receivable_movements (invoice_id, idempotency_key)
  where idempotency_key is not null and invoice_id is not null;

create unique index if not exists documents_idempotency_uq
  on public.documents (idempotency_key)
  where idempotency_key is not null and deleted_at is null;

create index if not exists documents_invoice_payment_idx
  on public.documents (invoice_id, payment_id)
  where payment_id is not null or invoice_id is not null;

create or replace function public.recalculate_invoice_paid_amount(p_invoice_id uuid)
returns numeric
language sql stable as $$
  select coalesce(sum(ip.amount),0)
  from public.invoice_payments ip
  where ip.invoice_id = p_invoice_id
    and ip.deleted_at is null;
$$;

create or replace function public.sync_invoice_financial_state(
  p_invoice_id uuid,
  p_actor uuid,
  p_reason text default null
) returns void language plpgsql security definer set search_path=public as $$
declare
  inv invoices%rowtype;
  next_paid numeric;
  next_status text;
begin
  select * into inv from invoices where id = p_invoice_id for update;
  if not found then
    return;
  end if;

  select public.recalculate_invoice_paid_amount(p_invoice_id) into next_paid;

  if inv.financial_record_state <> 'ACTIVE' then
    next_status := coalesce(inv.financial_record_state, 'CANCELLED');
  elsif inv.record_origin <> 'PRODUCTION' then
    next_status := upper(coalesce(inv.status, 'PAID'));
  else
    next_paid := coalesce(next_paid, 0);
    if next_paid < 0 then
      next_paid := 0;
    else
      next_paid := least(next_paid, coalesce(inv.amount, 0));
    end if;
    next_status := case
      when inv.status = 'DRAFT' then 'DRAFT'
      when inv.amount <= 0 then 'PAID'
      when next_paid >= inv.amount then 'PAID'
      when next_paid > 0 then 'PARTIALLY_PAID'
      else 'PENDING'
    end;
  end if;

  update public.invoices
  set paid_amount = least(next_paid, coalesce(amount,0)),
      status = next_status,
      closed_at = case when next_status = 'PAID' and inv.status <> 'PAID' then now() else closed_at end,
      cancelled_at = case when next_status = 'CANCELLED' then coalesce(cancelled_at, now()) else cancelled_at end,
      approval_reason = coalesce(nullif(trim(p_reason), ''), approval_reason),
      updated_by = coalesce(p_actor, updated_by),
      updated_at = now()
  where id = p_invoice_id;
end $$;

create or replace function public.apply_receivable_movement(
  p_invoice_id uuid,
  p_action text,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_method text,
  p_receipt_path text,
  p_receipt_checksum text,
  p_reason text,
  p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  inv invoices%rowtype;
  action text := upper(trim(p_action));
  movement_id uuid;
  payment_id uuid;
  effective numeric := 0;
  current_paid numeric := 0;
  normalized_key text;
  occurred_at timestamptz;
  normalized_method text;
  normalized_path text;
  normalized_checksum text;
  is_new_payment boolean := false;
  checksum_source text;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede gestionar pagos.';
  end if;

  if action not in ('DEPOSIT', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'RETURN_PENDING', 'ARCHIVE', 'CANCEL', 'DELETE') then
    raise exception 'Acción financiera no válida.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'El motivo es obligatorio.';
  end if;

  select * into inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Cuenta por cobrar no encontrada.';
  end if;

  occurred_at := coalesce(p_occurred_at, now());

  if action in ('DEPOSIT', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'RETURN_PENDING') then
    if inv.financial_record_state <> 'ACTIVE' or inv.record_origin <> 'PRODUCTION' or inv.deleted_at is not null then
      raise exception 'La cuenta inactiva no admite pagos.';
    end if;
  end if;

  current_paid := coalesce(public.recalculate_invoice_paid_amount(inv.id), 0);

  if action in ('DEPOSIT','PARTIAL_PAYMENT') then
    effective := coalesce(p_amount,0);
    if effective <= 0 then
      raise exception 'El monto debe ser mayor a cero.';
    end if;
    if (current_paid + effective) > coalesce(inv.amount,0) then
      raise exception 'El monto supera el saldo pendiente.';
    end if;
  elsif action = 'FULL_PAYMENT' then
    effective := coalesce(inv.amount,0) - current_paid;
    if effective <= 0 then
      raise exception 'La cuenta ya está completamente pagada.';
    end if;
  elsif action = 'RETURN_PENDING' then
    if current_paid <= 0 then
      raise exception 'La cuenta ya se encuentra pendiente.';
    end if;
    if inv.status not in ('PENDING', 'PARTIALLY_PAID', 'PAID') and inv.status <> 'DRAFT' then
      raise exception 'La cuenta no admite reversa en su estado actual.';
    end if;
    effective := -current_paid;
  else
    effective := 0;
  end if;

  normalized_method := coalesce(nullif(trim(p_method), ''), case when effective < 0 then 'REVERSAL' else 'OTHER' end);
  normalized_path := nullif(trim(p_receipt_path), '');
  normalized_checksum := nullif(trim(p_receipt_checksum), '');
  normalized_key := nullif(trim(p_idempotency_key), '');
  if normalized_key is null then
    normalized_key := concat(
      'phase1-receivable-v2|',
      inv.id::text, '|',
      action, '|',
      coalesce(to_char(round(effective::numeric, 2), 'FM999999990.00'), '0.00'), '|',
      coalesce(nullif(trim(p_reason), ''), '-'), '|',
      coalesce(normalized_path, '-'), '|',
      coalesce(normalized_method, '-')
    );
  end if;

  if action in ('DEPOSIT','PARTIAL_PAYMENT','FULL_PAYMENT','RETURN_PENDING') then
    select ip.id into payment_id
    from public.invoice_payments ip
    where ip.invoice_id = inv.id
      and ip.idempotency_key = normalized_key
      and ip.deleted_at is null
    limit 1;

    if payment_id is null then
      insert into public.receivable_movements(
        invoice_id,
        movement_type,
        amount,
        effective_amount,
        occurred_at,
        method,
        receipt_path,
        reason,
        actor_id,
        metadata,
        idempotency_key
      ) values (
        inv.id,
        action,
        abs(effective),
        effective,
        occurred_at,
        normalized_method,
        normalized_path,
        trim(p_reason),
        actor,
        jsonb_build_object(
          'previousPaid', current_paid,
          'saleTotal', coalesce(inv.amount, 0),
          'previousStatus', coalesce(inv.status, 'PENDING'),
          'previousRecordState', coalesce(inv.financial_record_state, 'ACTIVE'),
          'movementOrigin', 'APPLY_RECEIVABLE_MOVEMENT'
        ),
        normalized_key
      ) returning id into movement_id;

      insert into public.invoice_payments(
        invoice_id,
        amount,
        paid_at,
        method,
        reference,
        reason,
        created_by,
        movement_type,
        receipt_path,
        idempotency_key
      ) values (
        inv.id,
        effective,
        occurred_at,
        normalized_method,
        movement_id::text,
        trim(p_reason),
        actor,
        action,
        normalized_path,
        normalized_key
      ) returning id into payment_id;

      is_new_payment := true;
    else
      update public.invoice_payments
      set amount = effective,
          paid_at = occurred_at,
          method = coalesce(nullif(trim(p_method), ''), method),
          reason = trim(p_reason),
          receipt_path = coalesce(nullif(trim(p_receipt_path), ''), receipt_path),
      updated_at = now(),
      updated_by = actor
  where id = payment_id;
    end if;

    checksum_source := coalesce(
      normalized_checksum,
      'OPERATIONAL-FINGERPRINT:v1|' || inv.id::text || '|' || movement_id::text || '|' || action || '|' || coalesce(normalized_path, '<no-path>')
    );

    if is_new_payment and normalized_path is not null then
      insert into public.documents(
        invoice_id,
        payment_id,
        project_id,
        customer_id,
        orbit_event_id,
        document_type,
        storage_bucket,
        storage_path,
        checksum,
        created_by,
        updated_by,
        idempotency_key
      ) values (
        inv.id,
        payment_id,
        inv.project_id,
        inv.customer_id,
        inv.orbit_event_id,
        'PAYMENT_RECEIPT',
        'orbit-documents',
        normalized_path,
        checksum_source,
        actor,
        actor,
        normalized_key
      )
      on conflict (idempotency_key) do update
      set payment_id = excluded.payment_id,
          invoice_id = excluded.invoice_id,
          project_id = excluded.project_id,
          customer_id = excluded.customer_id,
          orbit_event_id = excluded.orbit_event_id,
          document_type = excluded.document_type,
          storage_bucket = coalesce(documents.storage_bucket, excluded.storage_bucket),
          storage_path = coalesce(documents.storage_path, excluded.storage_path),
          checksum = coalesce(documents.checksum, excluded.checksum),
          updated_at = now(),
          updated_by = actor;
    end if;

    if is_new_payment then
      insert into public.timeline_events(
        customer_id,
        project_id,
        orbit_event_id,
        event_type,
        title,
        description,
        actor_id,
        actor_label,
        source,
        action,
        entity_type,
        entity_id,
        human_message,
        correlation_id,
        reason,
        created_by
      ) values (
        inv.customer_id,
        inv.project_id,
        inv.orbit_event_id,
        'RECEIVABLE_' || action,
        case action
          when 'DEPOSIT' then 'Reserva recibida'
          when 'PARTIAL_PAYMENT' then 'Pago parcial recibido'
          when 'FULL_PAYMENT' then 'Pago total recibido'
          when 'RETURN_PENDING' then 'Cuenta restablecida a pendiente'
        end,
        trim(p_reason),
        actor,
        'Founder',
        'Administrator',
        'RECEIVABLE_' || action,
        'Invoice',
        inv.id,
        case
          when effective <> 0
            then 'Movimiento financiero por ' || to_char(effective, 'FM$999G999G999') || '.'
          else trim(p_reason)
        end,
        'receivable-movement:' || movement_id,
        trim(p_reason),
        actor
      );
    end if;
  else
    if action = 'ARCHIVE' then
      update public.invoices
      set financial_record_state = 'ARCHIVED',
          archived_at = now(),
          archived_by = actor,
          status = 'CANCELLED',
          cancelled_at = coalesce(cancelled_at, now()),
          approval_reason = trim(p_reason),
          updated_by = actor,
          updated_at = now()
      where id = inv.id;
    elsif action = 'CANCEL' then
      update public.invoices
      set financial_record_state = 'CANCELLED',
          status = 'CANCELLED',
          cancelled_at = now(),
          approval_reason = trim(p_reason),
          updated_by = actor,
          updated_at = now()
      where id = inv.id;
    else
      update public.invoices
      set financial_record_state = 'DELETED',
          status = 'CANCELLED',
          deleted_at = coalesce(deleted_at, now()),
          deleted_by = actor,
          approval_reason = trim(p_reason),
          updated_by = actor,
          updated_at = now()
      where id = inv.id;
    end if;

    insert into public.receivable_movements(
      invoice_id,
      movement_type,
      amount,
      effective_amount,
      occurred_at,
      method,
      reason,
      actor_id,
      metadata,
      idempotency_key
    ) values (
      inv.id,
      action,
      0,
      0,
      occurred_at,
      nullif(trim(p_method), ''),
      trim(p_reason),
      actor,
      jsonb_build_object('manualAction', action, 'manualActionAt', now(), 'manualActionBy', actor, 'manualActionReason', trim(p_reason)),
      normalized_key
    ) returning id into movement_id;

    insert into public.timeline_events(
      customer_id,
      project_id,
      orbit_event_id,
      event_type,
      title,
      description,
      actor_id,
      actor_label,
      source,
      action,
      entity_type,
      entity_id,
      human_message,
      correlation_id,
      reason,
      created_by
    ) values (
      inv.customer_id,
      inv.project_id,
      inv.orbit_event_id,
      case
        when action = 'ARCHIVE' then 'RECEIVABLE_ARCHIVED'
        when action = 'CANCEL' then 'RECEIVABLE_CANCELLED'
        else 'RECEIVABLE_DELETED'
      end,
      case
        when action = 'ARCHIVE' then 'Cuenta por cobrar archivada'
        when action = 'CANCEL' then 'Cuenta por cobrar cancelada'
        else 'Cuenta por cobrar eliminada'
      end,
      trim(p_reason),
      actor,
      'Founder',
      'Administrator',
      case
        when action = 'ARCHIVE' then 'RECEIVABLE_ARCHIVED'
        when action = 'CANCEL' then 'RECEIVABLE_CANCELLED'
        else 'RECEIVABLE_DELETED'
      end,
      'Invoice',
      inv.id,
      trim(p_reason),
      'receivable-movement:' || movement_id,
      trim(p_reason),
      actor
    );
  end if;

  perform public.sync_invoice_financial_state(inv.id, actor, trim(p_reason));
  perform public.sync_financial_event(inv.project_id);
  perform public.sync_event_profitability(inv.project_id);

  return coalesce(payment_id, movement_id);
end $$;

revoke all on function public.apply_receivable_movement(uuid,text,numeric,timestamptz,text,text,text,text,text) from public,anon;
grant execute on function public.apply_receivable_movement(uuid,text,numeric,timestamptz,text,text,text,text,text) to authenticated;

create or replace function public.register_receivable_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_method text,
  p_receipt_path text,
  p_receipt_name text,
  p_observation text,
  p_receipt_checksum text default null,
  p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  payment_id uuid;
  note text := coalesce(nullif(trim(p_observation), ''), 'Pago registrado desde Perfil del Cliente');
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede registrar pagos.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  if p_paid_at is null or length(trim(coalesce(p_method, ''))) = 0 then
    raise exception 'Fecha y método son obligatorios.';
  end if;

  payment_id := public.apply_receivable_movement(
    p_invoice_id => p_invoice_id,
    p_action => 'PARTIAL_PAYMENT',
    p_amount => p_amount,
    p_occurred_at => p_paid_at,
    p_method => p_method,
    p_receipt_path => p_receipt_path,
    p_receipt_checksum => p_receipt_checksum,
    p_reason => note,
    p_idempotency_key => p_idempotency_key
  );

  if p_receipt_name is not null and trim(p_receipt_name) <> '' then
    update public.invoice_payments
    set receipt_name = trim(p_receipt_name)
    where id = payment_id;
  end if;

  return payment_id;
end $$;

create or replace function public.register_receivable_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_method text,
  p_receipt_path text,
  p_receipt_name text,
  p_observation text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  payment_id uuid;
begin
  payment_id := public.register_receivable_payment(
    p_invoice_id => p_invoice_id,
    p_amount => p_amount,
    p_paid_at => p_paid_at,
    p_method => p_method,
    p_receipt_path => p_receipt_path,
    p_receipt_name => p_receipt_name,
    p_observation => p_observation,
    p_receipt_checksum => null,
    p_idempotency_key => null
  );
  return payment_id;
end $$;

revoke all on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text) from public,anon;
grant execute on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text) to authenticated;
revoke all on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text,text,text) to authenticated;

create or replace function public.preview_receivable_payment_receipt_backfill()
returns table(
  payment_id uuid,
  invoice_id uuid,
  project_id uuid,
  customer_id uuid,
  orbit_event_id text,
  receipt_path text,
  has_documents_row boolean,
  has_storage_object boolean,
  has_drive_file_id boolean,
  recommendation text
) language sql stable as $$
  select
    ip.id,
    ip.invoice_id,
    i.project_id,
    i.customer_id,
    i.orbit_event_id,
    ip.receipt_path,
    d.id is not null as has_documents_row,
    o.name is not null as has_storage_object,
    d.drive_file_id is not null as has_drive_file_id,
    case
      when d.id is null then 'INSERT'
      when d.invoice_id is null or d.payment_id is null then 'UPDATE'
      else 'NONE'
    end as recommendation
  from public.invoice_payments ip
  join public.invoices i on i.id = ip.invoice_id
  left join public.documents d on d.storage_path = ip.receipt_path and d.storage_bucket = 'orbit-documents' and d.deleted_at is null
  left join storage.objects o on o.bucket_id = 'orbit-documents' and o.name = ip.receipt_path
  where ip.deleted_at is null
    and coalesce(nullif(trim(ip.receipt_path), ''), '') <> ''
    and ip.receipt_path is not null
  order by ip.paid_at nulls last, ip.created_at desc;
$$;

create or replace function public.execute_receivable_payment_receipt_backfill(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  item record;
  ins_count integer := 0;
  up_count integer := 0;
  unchanged integer := 0;
  total integer := 0;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede ejecutar backfill de comprobantes.';
  end if;

  for item in
    select * from public.preview_receivable_payment_receipt_backfill()
  loop
    total := total + 1;
    if not item.has_storage_object then
      continue;
    end if;

    if item.recommendation = 'INSERT' then
      ins_count := ins_count + 1;
      if not p_dry_run then
        insert into public.documents(
          invoice_id,
          payment_id,
          project_id,
          customer_id,
          orbit_event_id,
          document_type,
          storage_bucket,
          storage_path,
          checksum,
          created_by,
          updated_by,
          idempotency_key
        ) values (
          item.invoice_id,
          item.payment_id,
          item.project_id,
          item.customer_id,
          item.orbit_event_id,
          'PAYMENT_RECEIPT',
          'orbit-documents',
          item.receipt_path,
          'OPERATIONAL-FINGERPRINT:v1|backfill|' || item.payment_id::text,
          actor,
          actor,
          'payment_receipt_backfill|' || item.payment_id::text
        )
        on conflict (idempotency_key) do nothing;
      end if;
    elsif item.recommendation = 'UPDATE' then
      up_count := up_count + 1;
      if not p_dry_run then
        update public.documents
        set invoice_id = item.invoice_id,
            payment_id = item.payment_id,
            project_id = item.project_id,
            customer_id = item.customer_id,
            orbit_event_id = item.orbit_event_id,
            storage_bucket = coalesce(documents.storage_bucket, 'orbit-documents'),
            document_type = coalesce(documents.document_type, 'PAYMENT_RECEIPT'),
            updated_by = actor,
            updated_at = now(),
            idempotency_key = coalesce(documents.idempotency_key, 'payment_receipt_backfill|' || item.payment_id::text)
        where storage_path = item.receipt_path
          and documents.storage_bucket = 'orbit-documents'
          and documents.deleted_at is null;
      end if;
    else
      unchanged := unchanged + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'total_scanned', total,
    'to_insert', ins_count,
    'to_update', up_count,
    'unchanged', unchanged,
    'dry_run', coalesce(p_dry_run, true)
  );
end $$;

revoke all on function public.preview_receivable_payment_receipt_backfill() from public,anon;
grant execute on function public.preview_receivable_payment_receipt_backfill() to authenticated;
revoke all on function public.execute_receivable_payment_receipt_backfill(boolean) from public,anon;
grant execute on function public.execute_receivable_payment_receipt_backfill(boolean) to authenticated, service_role;

create or replace function public.manage_receivable_payment(
  p_invoice_id uuid,
  p_payment_id uuid,
  p_action text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_method text,
  p_receipt_path text,
  p_reason text
) returns void language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  inv invoices%rowtype;
  payment invoice_payments%rowtype;
  action text := upper(trim(p_action));
  movement uuid;
  normalized_reason text := trim(coalesce(p_reason, ''));
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede gestionar movimientos.';
  end if;

  if action not in ('EDIT', 'DELETE') then
    raise exception 'Acción de movimiento no válida.';
  end if;

  if length(normalized_reason) < 3 then
    raise exception 'El motivo es obligatorio.';
  end if;

  select * into inv from invoices where id = p_invoice_id and deleted_at is null for update;
  if not found then
    raise exception 'Cuenta por cobrar no encontrada.';
  end if;

  select * into payment from invoice_payments where id = p_payment_id and invoice_id = p_invoice_id and deleted_at is null for update;
  if not found then
    raise exception 'Movimiento de pago no encontrado.';
  end if;

  insert into public.receivable_movement_revisions(
    invoice_id,
    payment_id,
    action,
    original_amount,
    new_amount,
    original_date,
    new_date,
    original_method,
    new_method,
    original_receipt_path,
    new_receipt_path,
    reason,
    actor_id
  ) values (
    inv.id,
    payment.id,
    action,
    payment.amount,
    case when action = 'EDIT' then p_amount end,
    payment.paid_at,
    case when action = 'EDIT' then p_paid_at end,
    payment.method,
    case when action = 'EDIT' then coalesce(nullif(trim(p_method), ''), payment.method) end,
    payment.receipt_path,
    case when action = 'EDIT' then coalesce(nullif(trim(p_receipt_path), ''), payment.receipt_path) end,
    normalized_reason,
    actor
  );

  if action = 'EDIT' then
    if p_amount is null or p_amount = 0 or p_paid_at is null or length(trim(coalesce(p_method, ''))) = 0 then
      raise exception 'Monto, fecha y método son obligatorios.';
    end if;

    update public.invoice_payments
    set amount = p_amount,
        paid_at = p_paid_at,
        method = trim(p_method),
        receipt_path = coalesce(nullif(trim(p_receipt_path), ''), receipt_path),
        reason = normalized_reason,
        updated_at = now(),
        updated_by = actor
    where id = payment.id;
  else
    update public.invoice_payments
    set deleted_at = now(),
        deleted_by = actor,
        updated_at = now(),
        updated_by = actor
    where id = payment.id;
  end if;

  perform public.sync_invoice_financial_state(inv.id, actor, normalized_reason);

  if action = 'EDIT' and nullif(trim(p_receipt_path), '') is not null then
    update public.documents
    set payment_id = payment.id,
        invoice_id = inv.id,
        updated_at = now(),
        updated_by = actor
    where payment_id = payment.id
       or (invoice_id = inv.id and storage_path = payment.receipt_path)
       or (invoice_id = inv.id and document_type = 'PAYMENT_RECEIPT');
  end if;

  insert into public.timeline_events(
    customer_id,
    project_id,
    orbit_event_id,
    event_type,
    title,
    description,
    actor_id,
    actor_label,
    source,
    action,
    entity_type,
    entity_id,
    human_message,
    correlation_id,
    reason,
    created_by
  ) values (
    inv.customer_id,
    inv.project_id,
    inv.orbit_event_id,
    'PAYMENT_MOVEMENT_' || action,
    case when action = 'EDIT' then 'Movimiento de pago corregido' else 'Movimiento de pago eliminado' end,
    normalized_reason,
    actor,
    'Founder',
    'Administrator',
    'PAYMENT_MOVEMENT_' || action,
    'InvoicePayment',
    payment.id,
    case
      when action = 'EDIT' then 'El movimiento fue actualizado y los saldos fueron recalculados.'
      else 'El movimiento fue eliminado de la operación activa y los saldos fueron recalculados.'
    end,
    'payment-management:' || gen_random_uuid(),
    normalized_reason,
    actor
  );

  perform public.sync_financial_event(inv.project_id);
  perform public.sync_event_profitability(inv.project_id);
end $$;

revoke all on function public.manage_receivable_payment(uuid,uuid,text,numeric,timestamptz,text,text,text) from public,anon;
grant execute on function public.manage_receivable_payment(uuid,uuid,text,numeric,timestamptz,text,text,text) to authenticated;

create or replace function public.sync_project_commercial_state(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  agreement_signed boolean := false;
  total numeric := 0;
  paid numeric := 0;
  required_deposit_rate numeric := 50;
  required_deposit numeric := 0;
  next_status text;
  invoice_amount numeric;
  invoice_paid numeric;
  quote_rate numeric;
begin
  select exists(
    select 1 from agreements where project_id = p_project_id and status = 'SIGNED'
  ) into agreement_signed;

  required_deposit_rate := 50;
  select coalesce(i.amount, 0), coalesce(public.recalculate_invoice_paid_amount(i.id), 0), coalesce(q.deposit_percent, 50)
  into invoice_amount, paid, quote_rate
  from invoices i
  left join quotations q on q.id = i.quotation_id
  where i.project_id = p_project_id
    and i.deleted_at is null
  order by i.created_at desc
  limit 1;
  required_deposit_rate := coalesce(quote_rate, 50);

  if invoice_amount is null or invoice_amount = 0 then
    select coalesce(q.final_customer_price, q.grand_total, q.total, 0), coalesce(q.deposit_percent, 50)
    into invoice_amount, quote_rate
    from quotations q
    where q.project_id = p_project_id and q.deleted_at is null
    order by q.created_at desc
    limit 1;
    required_deposit_rate := coalesce(quote_rate, 50);
  end if;

  total := coalesce(invoice_amount,0);
  paid := coalesce(paid,0);
  required_deposit := round(total * coalesce(required_deposit_rate, 50) / 100);

  next_status := case
    when not agreement_signed then 'CONTRACT_PENDING'
    when total <= 0 or paid < required_deposit then 'WAITING_DEPOSIT'
    else 'CONFIRMED'
  end;

  update public.projects
  set status = next_status,
      updated_at = now()
  where id = p_project_id
    and deleted_at is null
    and upper(status) not in ('CANCELLED','CANCELED','ARCHIVED','PRODUCTION','EVENT','DELIVERY','CLOSED','COMPLETED');

  update public.crm_reservations
  set status = public.commercial_reservation_status(next_status),
      updated_at = now()
  where project_id = p_project_id
    and status not in ('CANCELLED', 'ARCHIVED');

  return jsonb_build_object(
    'projectId', p_project_id,
    'agreementSigned', agreement_signed,
    'total', total,
    'paid', paid,
    'requiredDeposit', required_deposit,
    'requiredDepositRate', coalesce(required_deposit_rate, 50),
    'status', next_status
  );
end $$;

revoke all on function public.sync_project_commercial_state(uuid) from public,anon;
grant execute on function public.sync_project_commercial_state(uuid) to authenticated,service_role;

create or replace view public.accounts_receivable_projection with (security_invoker=true) as
select *
from public.accounts_receivable_history
where financial_record_state = 'ACTIVE'
  and record_origin = 'PRODUCTION'
  and deleted_at is null
  and upper(status) <> 'DRAFT';

grant select on public.accounts_receivable_projection to authenticated;

commit;

begin;

-- One bank transfer may settle the closed period's honoraria and its already
-- approved reimbursements. The existing period payment remains the tax ledger
-- (net honoraria + withholding); reimbursements remain a separate ledger.
create or replace function public.register_staff_period_transfer(
  p_period_id uuid,
  p_total_amount numeric,
  p_paid_on date,
  p_method text,
  p_reference text,
  p_idempotency_key text,
  p_bucket text,
  p_path text,
  p_file_name text,
  p_mime_type text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  period public.staff_payment_periods;
  account public.staff_monthly_accounts;
  period_payment public.staff_period_payments;
  expense_row record;
  existing_reimbursement public.staff_reimbursement_payments;
  receipt_id uuid;
  honoraria numeric;
  reimbursements numeric := 0;
  paid_reimbursements numeric := 0;
  expected_reimbursements numeric := 0;
  reimbursement_key text;
  actor uuid := auth.uid();
begin
  if actor is null or not public.can_administer() then
    raise exception 'Acceso administrativo requerido.';
  end if;
  if coalesce(p_total_amount, 0) <= 0 or p_total_amount <> round(p_total_amount, 0)
     or p_paid_on is null or nullif(trim(p_method), '') is null
     or nullif(trim(p_reference), '') is null or nullif(trim(p_idempotency_key), '') is null
     or p_bucket is distinct from 'orbit-documents'
     or nullif(trim(p_path), '') is null or nullif(trim(p_file_name), '') is null
     or p_mime_type not in ('application/pdf','image/png','image/jpeg','image/webp') then
    raise exception 'Monto CLP, fecha, método, referencia y comprobante son obligatorios.';
  end if;

  select a.* into account
  from public.staff_monthly_accounts a
  join public.staff_payment_periods p on p.account_id = a.id
  where p.id = p_period_id
  for update of a;
  select * into period from public.staff_payment_periods where id = p_period_id for update;
  if not found then raise exception 'Período no encontrado.'; end if;
  if period.status <> 'FINALIZED' then raise exception 'El bloque debe estar cerrado antes de pagar.'; end if;

  select * into period_payment
  from public.staff_period_payments
  where period_id = p_period_id and idempotency_key = p_idempotency_key;
  if found then
    if period_payment.reference <> trim(p_reference) then
      raise exception 'La clave de pago pertenece a otra transferencia.';
    end if;
    select coalesce(sum(r.amount), 0) into reimbursements
    from public.staff_reimbursement_payments r
    where r.staff_id = account.staff_id and r.notes = trim(p_reference);
    return jsonb_build_object(
      'idempotent', true, 'periodPaymentId', period_payment.id,
      'receiptDocumentId', period_payment.receipt_document_id,
      'honoraria', period_payment.amount, 'reimbursements', reimbursements,
      'total', period_payment.amount + reimbursements,
      'withholdingAmount', period_payment.withholding_amount
    );
  end if;

  -- A bank reference is a transfer identity, not merely free text. Refuse a
  -- second registration even if a different idempotency key is submitted.
  if exists (
    select 1 from public.staff_period_payments p
    join public.staff_payment_periods sp on sp.id = p.period_id
    where sp.account_id = account.id and p.reference = trim(p_reference)
  ) or exists (
    select 1 from public.staff_reimbursement_payments r
    where r.staff_id = account.staff_id and r.notes = trim(p_reference)
  ) then
    raise exception 'La referencia bancaria ya fue registrada para este trabajador.' using errcode='23505';
  end if;

  -- Derive the reimbursement set from canonical approved expenses in this
  -- period. No caller can inject an unrelated expense into the transfer.
  for expense_row in
    select e.id, e.total
    from public.expenses e
    join public.projects project_row on project_row.id = e.project_id
    where e.responsible_staff_id = account.staff_id
      and e.status = 'APPROVED'
      and e.expense_scope = 'STAFF_REIMBURSEMENT'
      and e.deleted_at is null
      and project_row.deleted_at is null
      and project_row.event_date between period.starts_on and period.ends_on
    order by e.id
    for update of e
  loop
    select * into existing_reimbursement
    from public.staff_reimbursement_payments r
    where r.expense_id = expense_row.id
    for update;
    if found then
      paid_reimbursements := paid_reimbursements + expense_row.total;
    else
      expected_reimbursements := expected_reimbursements + expense_row.total;
    end if;
  end loop;

  honoraria := p_total_amount - expected_reimbursements;
  if honoraria <= 0 then raise exception 'La transferencia no contiene honorarios pendientes.'; end if;
  if honoraria <> coalesce((period.snapshot->>'workPending')::numeric, 0) then
    raise exception 'El monto de honorarios no coincide con el saldo Q1.';
  end if;

  -- Reuse the canonical tax/payment allocator. Any later failure rolls back
  -- this call and all reimbursement rows atomically.
  perform public.register_staff_period_payment(
    p_period_id, honoraria, p_paid_on, p_method, trim(p_reference),
    p_idempotency_key, p_bucket, p_path, p_file_name, p_mime_type
  );
  select * into period_payment from public.staff_period_payments
  where period_id = p_period_id and idempotency_key = p_idempotency_key;
  if not found then raise exception 'No se pudo crear el movimiento de honorarios.'; end if;
  receipt_id := period_payment.receipt_document_id;

  for expense_row in
    select e.id, e.total, e.responsible_staff_id, e.project_id,
           e.event_staff_settlement_id, submission.id as submission_id,
           project_row.event_date, project_row.customer_id, project_row.orbit_event_id
    from public.expenses e
    join public.projects project_row on project_row.id = e.project_id
    join public.staff_expense_submissions submission
      on submission.materialized_expense_id = e.id
     and submission.status = 'APPROVED' and submission.reimbursement = true
    where e.responsible_staff_id = account.staff_id
      and e.status = 'APPROVED' and e.expense_scope = 'STAFF_REIMBURSEMENT'
      and e.deleted_at is null and project_row.deleted_at is null
      and project_row.event_date between period.starts_on and period.ends_on
    order by e.id
    for update of e, submission
  loop
    if not exists (select 1 from public.staff_reimbursement_payments where expense_id = expense_row.id) then
      reimbursement_key := 'staff-period-transfer:' || period_payment.id || ':' || expense_row.id;
      insert into public.staff_reimbursement_payments(
        expense_id, staff_expense_submission_id, settlement_id, staff_id,
        project_id, amount, paid_on, method, notes, receipt_document_id,
        idempotency_key, created_by
      ) values (
        expense_row.id, expense_row.submission_id, expense_row.event_staff_settlement_id,
        account.staff_id, expense_row.project_id, expense_row.total, p_paid_on,
        trim(p_method), trim(p_reference), receipt_id, reimbursement_key, actor
      );
      insert into public.timeline_events(
        project_id, customer_id, staff_id, orbit_event_id, event_type, title,
        description, new_state, reason, actor_label, source, action, entity_type,
        entity_id, human_message, correlation_id, created_by
      ) values (
        expense_row.project_id, expense_row.customer_id, account.staff_id,
        expense_row.orbit_event_id, 'STAFF_REIMBURSEMENT_PAID',
        'Reembolso Staff pagado', 'Transferencia bancaria ' || trim(p_reference),
        'PAID', 'Pago agrupado con honorarios Q1', 'Founder', 'Administrator',
        'STAFF_REIMBURSEMENT_PAID', 'StaffReimbursementPayment', expense_row.id,
        'Reembolso pagado dentro de una transferencia bancaria agrupada.',
        'staff-period-transfer:' || period_payment.id || ':' || expense_row.id, actor
      ) on conflict(correlation_id) do nothing;
    end if;
  end loop;

  perform public.ensure_staff_monthly_account(account.staff_id, account.accounting_month);
  select coalesce(sum(r.amount), 0) into reimbursements
  from public.staff_reimbursement_payments r
  where r.staff_id = account.staff_id and r.paid_on = p_paid_on
    and r.notes = trim(p_reference);

  return jsonb_build_object(
    'idempotent', false, 'periodPaymentId', period_payment.id,
    'receiptDocumentId', receipt_id, 'honoraria', honoraria,
    'reimbursements', reimbursements, 'total', honoraria + reimbursements,
    'withholdingAmount', period_payment.withholding_amount
  );
end;
$$;

revoke all on function public.register_staff_period_transfer(uuid,numeric,date,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_staff_period_transfer(uuid,numeric,date,text,text,text,text,text,text,text) to authenticated;

commit;

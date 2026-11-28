begin;

alter table public.staff_expense_submissions
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text;

create or replace function public.cancel_staff_expense_submission(
  p_submission_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  initial_submission public.staff_expense_submissions%rowtype;
  item public.staff_expense_submissions%rowtype;
  expense_row public.expenses%rowtype;
  settlement_row public.event_staff_payments%rowtype;
  project_row public.projects%rowtype;
  account_row public.staff_monthly_accounts%rowtype;
  calc jsonb;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede anular reembolsos.'
      using errcode = '42501';
  end if;

  if p_submission_id is null then
    raise exception 'Reembolso no encontrado.' using errcode = '22023';
  end if;

  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'El motivo de anulación es obligatorio.' using errcode = '22023';
  end if;

  -- Payment and cancellation use the same lock order:
  -- expenses -> submission -> settlement. This prevents a payment/void
  -- deadlock while both operations are touching the same reimbursement.
  select *
    into initial_submission
  from public.staff_expense_submissions
  where id = p_submission_id
    and reimbursement is true;

  if not found then
    raise exception 'Reembolso no encontrado.' using errcode = 'P0002';
  end if;

  if initial_submission.materialized_expense_id is not null then
    select *
      into expense_row
    from public.expenses
    where id = initial_submission.materialized_expense_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'El reembolso no tiene un gasto materializado válido.'
        using errcode = '23503';
    end if;
  end if;

  select *
    into item
  from public.staff_expense_submissions
  where id = p_submission_id
    and reimbursement is true
  for update;

  if not found then
    raise exception 'Reembolso no encontrado.' using errcode = 'P0002';
  end if;

  if item.materialized_expense_id is distinct from initial_submission.materialized_expense_id then
    raise exception 'El reembolso cambió durante la operación; inténtalo nuevamente.'
      using errcode = '40001';
  end if;

  -- Re-check the locked expense after locking the submission. A paid expense,
  -- a reimbursement-ledger row, or a paid settlement is immutable here.
  if item.materialized_expense_id is not null then
    if expense_row.id is distinct from item.materialized_expense_id then
      raise exception 'El reembolso no tiene un gasto materializado válido.'
        using errcode = '23503';
    end if;

    if pg_catalog.upper(coalesce(expense_row.status, '')) in ('PAID', 'SETTLED', 'COMPLETED') then
      raise exception 'El reembolso ya tiene estado de pago y no puede anularse.'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.staff_reimbursement_payments payment
      where payment.expense_id = expense_row.id
         or payment.staff_expense_submission_id = item.id
    ) then
      raise exception 'El reembolso ya tiene un pago registrado; no puede anularse.'
        using errcode = '23514';
    end if;
  end if;

  if item.status = 'CANCELLED' then
    return item.id;
  end if;

  if item.status <> 'APPROVED' then
    raise exception 'Solo se puede anular un reembolso aprobado.' using errcode = '23514';
  end if;

  if item.materialized_expense_id is null then
    raise exception 'El reembolso aprobado no tiene un gasto materializado.'
      using errcode = '23503';
  end if;

  if expense_row.status <> 'APPROVED' then
    raise exception 'El gasto materializado no está en un estado anulable.'
      using errcode = '23514';
  end if;

  if item.project_id is null or item.staff_id is null then
    raise exception 'El reembolso no tiene asociación canónica de Evento y Staff.'
      using errcode = '23503';
  end if;

  select *
    into project_row
  from public.projects
  where id = item.project_id
    and deleted_at is null;

  if not found then
    raise exception 'Evento no encontrado.' using errcode = '23503';
  end if;

  if expense_row.event_staff_settlement_id is not null then
    select *
      into settlement_row
    from public.event_staff_payments
    where id = expense_row.event_staff_settlement_id
      and staff_id = item.staff_id
      and project_id = item.project_id
      and status = 'CONFIRMED'
      and deleted_at is null
    for update;

    if not found then
      raise exception 'La liquidación Staff asociada no está disponible.'
        using errcode = '23503';
    end if;
  end if;

  update public.staff_expense_submissions
  set status = 'CANCELLED',
      cancelled_at = pg_catalog.now(),
      cancelled_by = actor,
      cancellation_reason = pg_catalog.btrim(p_reason),
      reviewed_at = pg_catalog.now(),
      reviewed_by = actor,
      updated_at = pg_catalog.now()
  where id = item.id;

  -- Keep rejection_reason untouched: cancellation has its own audited reason.
  update public.expenses
  set status = 'CANCELLED',
      updated_at = pg_catalog.now(),
      updated_by = actor
  where id = expense_row.id
    and status = 'APPROVED';

  insert into public.timeline_events(
    project_id, customer_id, staff_id, orbit_event_id, event_type, title,
    description, new_state, reason, actor_label, source, action, entity_type,
    entity_id, human_message, correlation_id, created_by
  )
  values(
    project_row.id, project_row.customer_id, item.staff_id,
    project_row.orbit_event_id, 'STAFF_REIMBURSEMENT_CANCELLED',
    'Reembolso Staff anulado',
    pg_catalog.concat(item.category, ' · $', item.amount), 'CANCELLED',
    pg_catalog.btrim(p_reason), 'Administrador', 'Administrator',
    'STAFF_REIMBURSEMENT_CANCELLED', 'StaffExpenseSubmission', item.id,
    'Reembolso Staff anulado sin movimiento de pago.',
    pg_catalog.concat('staff-reimbursement-cancelled:', item.id), actor
  )
  on conflict(correlation_id) do nothing;

  -- The legacy helper refreshes expected_amount only. Rebuild the canonical
  -- monthly projection explicitly so pending reimbursement and transfer totals
  -- immediately exclude this cancelled record.
  select *
    into account_row
  from public.ensure_staff_monthly_account(item.staff_id, project_row.event_date);

  calc := public.calculate_staff_monthly_settlement(item.staff_id, project_row.event_date);

  if account_row.settlement_status <> 'FINALIZED'
     and account_row.payment_status <> 'PAID' then
    update public.staff_monthly_accounts
    set expected_amount = coalesce((calc ->> 'finalTransferAmount')::numeric, 0),
        work_net = coalesce((calc ->> 'workNet')::numeric, 0),
        boleta_gross = coalesce((calc ->> 'boletaGross')::numeric, 0),
        withholding_rate = coalesce((calc ->> 'withholdingRate')::numeric, 0),
        withholding_amount = coalesce((calc ->> 'withholdingAmount')::numeric, 0),
        boleta_net = coalesce((calc ->> 'boletaNet')::numeric, 0),
        advances_total = coalesce((calc ->> 'advancesTotal')::numeric, 0),
        reimbursements_total = coalesce((calc ->> 'reimbursementsTotal')::numeric, 0),
        reimbursements_paid_total = coalesce((calc ->> 'reimbursementsPaidTotal')::numeric, 0),
        reimbursements_pending_total = coalesce((calc ->> 'reimbursementsPendingTotal')::numeric, 0),
        final_transfer_amount = coalesce((calc ->> 'finalTransferAmount')::numeric, 0),
        excess_advance = coalesce((calc ->> 'excessAdvance')::numeric, 0),
        event_count = coalesce((calc ->> 'eventCount')::integer, 0),
        calculation = calc,
        review_required = coalesce((calc ->> 'reviewRequired')::boolean, false),
        review_reason = nullif(calc ->> 'reviewReason', ''),
        updated_at = pg_catalog.now()
    where id = account_row.id;
  end if;

  return item.id;
end;
$$;

alter function public.cancel_staff_expense_submission(uuid, text) owner to postgres;

revoke all on function public.cancel_staff_expense_submission(uuid, text) from public, anon;
grant execute on function public.cancel_staff_expense_submission(uuid, text) to authenticated;

commit;

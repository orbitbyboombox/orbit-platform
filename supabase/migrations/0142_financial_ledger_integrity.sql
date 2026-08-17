begin;

-- 0142 Financial Ledger Integrity (canonical ledger + audit read models)
-- Scope:
--   * Canonical monetary source: public.invoice_payments with ip.deleted_at IS NULL.
--   * Canonical movement semantics for cash impact.
--   * Technical/reversals only affecting audit layer unless explicitly completed.
--   * Read-only integrity previews for historical repair planning.

-- Canonical cash-impact by payment movement type in invoice_payments.
create or replace function public.invoice_payment_cash_impact(
  p_movement_type text,
  p_amount numeric
) returns numeric
language sql
immutable as $$
  select case
    when upper(coalesce(trim(p_movement_type), 'PARTIAL_PAYMENT')) in (
      'DEPOSIT',
      'PARTIAL_PAYMENT',
      'FULL_PAYMENT'
    ) then coalesce(p_amount, 0)
    when upper(coalesce(trim(p_movement_type), '')) = 'RETURN_COMPLETED' then -abs(coalesce(p_amount, 0))
    else 0
  end;
$$;

-- Canonical paid_amount source: invoice_payments active rows only.
create or replace function public.recalculate_invoice_paid_amount(p_invoice_id uuid)
returns numeric
language sql
stable
set search_path=public as $$
  select coalesce(
    sum(public.invoice_payment_cash_impact(ip.movement_type, ip.amount)),
    0
  )
  from public.invoice_payments ip
  where ip.invoice_id = p_invoice_id
    and ip.deleted_at is null;
$$;

-- Canonical cash-impact for audit/event layer movements.
create or replace function public.receivable_movement_cash_impact(
  p_movement_type text,
  p_amount numeric,
  p_effective_amount numeric,
  p_metadata jsonb
) returns numeric
language sql
immutable as $$
  select case
    when upper(coalesce(p_metadata ->> 'managedAction', '')) in ('DELETE', 'CANCEL') then 0
    when upper(coalesce(trim(p_movement_type), '')) in ('DEPOSIT', 'PARTIAL_PAYMENT', 'FULL_PAYMENT')
      then coalesce(p_effective_amount, p_amount, 0)
    when upper(coalesce(trim(p_movement_type), '')) = 'RETURN_COMPLETED' then -abs(coalesce(p_effective_amount, p_amount, 0))
    when upper(coalesce(trim(p_movement_type), '')) = 'RETURN_PENDING' then 0
    else 0
  end;
$$;

create or replace function public.recalculate_receivable_movement_amount(p_invoice_id uuid)
returns numeric
language sql
stable
set search_path=public as $$
  select coalesce(sum(
    public.receivable_movement_cash_impact(
      rm.movement_type,
      rm.amount,
      rm.effective_amount,
      rm.metadata
    )
  ), 0)
  from public.receivable_movements rm
  where rm.invoice_id = p_invoice_id;
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

-- Read-model: one row per invoice with canonical reconciliation signals.
create or replace function public.preview_financial_ledger_integrity(p_invoice_id uuid default null)
returns table(
  invoice_id uuid,
  project_id uuid,
  status text,
  payment_ledger numeric,
  movement_ledger numeric,
  paid_amount numeric,
  payment_minus_paid numeric,
  movement_minus_payment numeric,
  has_return_pending_active boolean,
  active_return_pending_total numeric,
  deleted_payments_without_audit_link integer,
  requires_repair boolean,
  repair_hint text
) language sql stable
set search_path=public as $$
  with base as (
    select
      i.id,
      i.project_id,
      i.status,
      i.paid_amount as current_paid,
      public.recalculate_invoice_paid_amount(i.id) as canonical_payment_ledger,
      public.recalculate_receivable_movement_amount(i.id) as canonical_movement_ledger
    from public.invoices i
    where i.record_origin = 'PRODUCTION'
      and i.deleted_at is null
      and i.financial_record_state = 'ACTIVE'
      and (p_invoice_id is null or i.id = p_invoice_id)
  ),
  deleted_without_link as (
    select
      b.id as invoice_id,
      count(*) as deleted_without_audit_link
    from base b
    join public.invoice_payments ip
      on ip.invoice_id = b.id
     and ip.deleted_at is not null
    where not (
      ip.reference ~* '^[0-9a-fA-F-]{36}$'
      and exists (
        select 1
        from public.receivable_movements rm
        where rm.id = ip.reference::uuid
          and upper(rm.metadata ->> 'managedAction') = 'DELETE'
      )
    )
    group by b.id
  ),
  return_pending_active as (
    select
      i.id as invoice_id,
      coalesce(sum(ip.amount), 0) as return_pending_total
    from public.invoices i
    left join public.invoice_payments ip
      on ip.invoice_id = i.id
     and ip.deleted_at is null
     and ip.movement_type = 'RETURN_PENDING'
    group by i.id
  )
  select
    b.id,
    b.project_id,
    b.status,
    b.canonical_payment_ledger,
    b.canonical_movement_ledger,
    b.current_paid,
    (b.canonical_payment_ledger - b.current_paid) as payment_minus_paid,
    (b.canonical_movement_ledger - b.canonical_payment_ledger) as movement_minus_payment,
    coalesce(r.return_pending_total, 0) <> 0,
    coalesce(r.return_pending_total, 0),
    coalesce(d.deleted_without_audit_link, 0)::integer,
    (coalesce(r.return_pending_total, 0) <> 0)
      or (b.canonical_payment_ledger <> b.current_paid)
      or (b.canonical_movement_ledger <> b.canonical_payment_ledger),
    case
      when (b.canonical_payment_ledger = b.current_paid and coalesce(r.return_pending_total, 0) = 0)
        then 'NO_ACTION'
      when b.canonical_payment_ledger = b.current_paid and coalesce(r.return_pending_total, 0) <> 0
        then 'MARK_RETURN_PENDING_AS_TECHNICAL_ONLY'
      when b.canonical_movement_ledger <> b.canonical_payment_ledger
        then 'ALIGN_MOVEMENT_LAYER'
      when b.canonical_payment_ledger <> b.current_paid
        then 'SET_INVOICE_PAID_AMOUNT_FROM_CANONICAL_LEDGER'
      else 'REVIEW_MOVEMENT_LAYER'
    end
  from base b
  left join deleted_without_link d on d.invoice_id = b.id
  left join return_pending_active r on r.invoice_id = b.id;
$$;

-- Preview repair plan for targeted ids. No data changes are executed.
create or replace function public.preview_invoice_repair_plan(
  p_invoice_ids uuid[] default null
) returns table(
  invoice_id uuid,
  project_id uuid,
  invoice_status text,
  current_paid_amount numeric,
  canonical_paid_amount numeric,
  current_outstanding numeric,
  canonical_outstanding numeric,
  paid_amount_delta numeric,
  por_cobrar_delta numeric,
  cobrado_delta numeric,
  action text,
  notes text
) language sql stable
set search_path=public as $$
  select
    i.id,
    i.project_id,
    i.status,
    i.paid_amount::numeric as current_paid_amount,
    public.recalculate_invoice_paid_amount(i.id) as canonical_paid_amount,
    (i.amount - i.paid_amount)::numeric as current_outstanding,
    (i.amount - public.recalculate_invoice_paid_amount(i.id))::numeric as canonical_outstanding,
    (public.recalculate_invoice_paid_amount(i.id) - i.paid_amount) as paid_amount_delta,
    ((i.amount - public.recalculate_invoice_paid_amount(i.id)) - (i.amount - i.paid_amount)) as por_cobrar_delta,
    ((public.recalculate_invoice_paid_amount(i.id) - i.paid_amount) * -1) as cobrado_delta,
    case
      when public.recalculate_invoice_paid_amount(i.id) <> i.paid_amount then 'SET_INVOICE.paid_amount'
      else 'NO_OPERATION'
    end as action,
    case
      when public.recalculate_invoice_paid_amount(i.id) = i.paid_amount then
        'No hay impacto económico; mantener evidencia técnica existente.'
      else
        'Recalcular paid_amount desde invoice_payments activo/canónico y re-ejecutar sincronización de proyección.'
    end as notes
  from public.invoices i
  where i.record_origin = 'PRODUCTION'
    and i.deleted_at is null
    and i.financial_record_state = 'ACTIVE'
    and (p_invoice_ids is null or i.id = ANY(p_invoice_ids))
    and (
      public.recalculate_invoice_paid_amount(i.id) <> i.paid_amount
      or public.recalculate_receivable_movement_amount(i.id) <> public.recalculate_invoice_paid_amount(i.id)
      or coalesce((
        select sum(ip.amount)
        from public.invoice_payments ip
        where ip.invoice_id = i.id
          and ip.deleted_at is null
          and ip.movement_type = 'RETURN_PENDING'
      ), 0) <> 0
    );
$$;

-- High-level integrity aggregate (all zeros means healthy).
create or replace function public.financial_ledger_integrity_summary()
returns table(
  total_active_invoices bigint,
  payment_paid_mismatches bigint,
  movement_payment_mismatches bigint,
  active_return_pending_invoices bigint,
  deleted_payment_audit_mismatches bigint,
  all_clean boolean
) language sql stable
set search_path=public as $$
  with facts as (
    select
      count(*) as total_active_invoices,
      count(*) filter (where payment_ledger <> paid_amount) as payment_paid_mismatches,
      count(*) filter (where movement_ledger <> payment_ledger) as movement_payment_mismatches,
      count(*) filter (where has_return_pending_active) as active_return_pending_invoices,
      count(*) filter (where deleted_payments_without_audit_link > 0) as deleted_payment_audit_mismatches
    from public.preview_financial_ledger_integrity()
  )
  select
    total_active_invoices,
    payment_paid_mismatches,
    movement_payment_mismatches,
    active_return_pending_invoices,
    deleted_payment_audit_mismatches,
    payment_paid_mismatches = 0
      and movement_payment_mismatches = 0
      and active_return_pending_invoices = 0
      and deleted_payment_audit_mismatches = 0
  from facts;
$$;

-- Keep access aligned with read-only reporting surface.
revoke all on function public.invoice_payment_cash_impact(text,numeric) from public,anon;
grant execute on function public.invoice_payment_cash_impact(text,numeric) to authenticated;

revoke all on function public.recalculate_receivable_movement_amount(uuid) from public,anon;
grant execute on function public.recalculate_receivable_movement_amount(uuid) to authenticated;

revoke all on function public.preview_financial_ledger_integrity(uuid) from public,anon;
grant execute on function public.preview_financial_ledger_integrity(uuid) to authenticated;

revoke all on function public.preview_invoice_repair_plan(uuid[]) from public,anon;
grant execute on function public.preview_invoice_repair_plan(uuid[]) to authenticated;

revoke all on function public.financial_ledger_integrity_summary() from public,anon;
grant execute on function public.financial_ledger_integrity_summary() to authenticated;

commit;

begin;

-- Outstanding debt is overdue when its canonical due date has passed, even
-- when the invoice already has one or more partial payments. Keep the raw
-- invoice status as ledger history and correct only the shared read model used
-- by Accounts Receivable, Finance, Collections and Founder reporting.
create or replace view public.accounts_receivable_history
with (security_invoker=true) as
select
  -- Keep the established view column order stable. `invoices` gained
  -- `due_date_source` after this view was created, so a table wildcard would
  -- insert that base-table column in the middle of the public view contract.
  i.id,
  i.invoice_number,
  i.customer_id,
  i.project_id,
  i.quotation_id,
  i.agreement_id,
  i.orbit_event_id,
  i.customer_type,
  i.status,
  i.issue_date,
  i.due_date,
  i.payment_term,
  i.custom_term_days,
  i.purchase_order,
  i.currency,
  i.amount,
  i.paid_amount,
  i.notes,
  i.issued_by,
  i.issued_at,
  i.closed_at,
  i.cancelled_at,
  i.version,
  i.created_by,
  i.created_at,
  i.updated_by,
  i.updated_at,
  i.approved_by,
  i.approved_at,
  i.approval_reason,
  i.deleted_by,
  i.deleted_at,
  i.financial_record_state,
  i.record_origin,
  i.archived_at,
  i.archived_by,
  greatest(i.amount-i.paid_amount,0)::numeric(14,2) as outstanding_balance,
  case
    when i.financial_record_state<>'ACTIVE' then i.financial_record_state
    when i.paid_amount=i.amount and i.amount>0 then 'PAID'
    when i.status='DRAFT' then 'DRAFT'
    when i.due_date<timezone('America/Santiago',now())::date
      and i.amount-i.paid_amount>0 then 'OVERDUE'
    when i.paid_amount>0 then 'PARTIALLY_PAID'
    else 'PENDING'
  end as effective_status,
  case
    when i.due_date is null then null
    else i.due_date-timezone('America/Santiago',now())::date
  end as days_remaining,
  case
    when i.due_date is null
      or i.due_date>=timezone('America/Santiago',now())::date
      or i.amount=i.paid_amount then 'CURRENT'
    when timezone('America/Santiago',now())::date-i.due_date<=15 then '15'
    when timezone('America/Santiago',now())::date-i.due_date<=30 then '30'
    when timezone('America/Santiago',now())::date-i.due_date<=60 then '60'
    else '90+'
  end as aging_bucket,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',p.id,
        'amount',p.amount,
        'paidAt',p.paid_at,
        'method',p.method,
        'reason',p.reason,
        'type',p.movement_type,
        'receiptPath',p.receipt_path
      ) order by p.paid_at desc,p.created_at desc
    )
    from public.invoice_payments p
    where p.invoice_id=i.id
  ),'[]'::jsonb) as payment_history
from public.invoices i;

grant select on public.accounts_receivable_history to authenticated;
grant select on public.accounts_receivable_projection to authenticated;

commit;

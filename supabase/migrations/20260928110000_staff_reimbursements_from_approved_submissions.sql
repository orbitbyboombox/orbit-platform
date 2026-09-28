begin;

-- Reimbursements are sourced from the approved Staff submission ledger.
-- Materialized expenses remain operational artifacts and must not determine
-- whether an approved reimbursement is included in monthly finance.
create or replace view public.staff_settlement_financials
with (security_invoker=true) as
select
  settlement.id as settlement_id,
  settlement.staff_id,
  settlement.project_id,
  settlement.accounting_month,
  coalesce(settlement.operator_payment,0::numeric) as original_operator,
  coalesce(settlement.assembly_payment,0::numeric) as original_assembly,
  coalesce(settlement.disassembly_payment,0::numeric) as original_disassembly,
  coalesce(settlement.total_internal_payment,0::numeric) as original_net,
  coalesce(adjustment.total,0::numeric) as adjustment_total,
  coalesce(reimbursement.total,0::numeric) as reimbursement_total,
  coalesce(reimbursement_payment.total,0::numeric) as reimbursement_paid_amount,
  greatest(coalesce(reimbursement.total,0::numeric)-coalesce(reimbursement_payment.total,0::numeric),0::numeric) as reimbursement_pending_amount,
  coalesce(settlement.total_internal_payment,0::numeric)+coalesce(adjustment.total,0::numeric) as payroll_net,
  coalesce(settlement.total_internal_payment,0::numeric)+coalesce(adjustment.total,0::numeric)+coalesce(reimbursement.total,0::numeric) as final_amount,
  settlement.paid_amount,
  least(settlement.paid_amount,coalesce(settlement.total_internal_payment,0::numeric)+coalesce(adjustment.total,0::numeric)) as payroll_paid_amount,
  greatest(coalesce(settlement.total_internal_payment,0::numeric)+coalesce(adjustment.total,0::numeric)-settlement.paid_amount,0::numeric)+greatest(coalesce(reimbursement.total,0::numeric)-coalesce(reimbursement_payment.total,0::numeric),0::numeric) as remaining_balance,
  greatest(settlement.paid_amount-(coalesce(settlement.total_internal_payment,0::numeric)+coalesce(adjustment.total,0::numeric)),0::numeric) as credit_balance,
  settlement.settlement_status,
  settlement.sii_receipt_status
from public.event_staff_payments settlement
left join lateral (
  select sum(event_staff_settlement_adjustments.amount) as total
  from public.event_staff_settlement_adjustments
  where event_staff_settlement_adjustments.settlement_id=settlement.id
) adjustment on true
left join lateral (
  select sum(submission.amount) as total
  from public.staff_expense_submissions submission
  where submission.staff_id=settlement.staff_id
    and submission.project_id=settlement.project_id
    and submission.status='APPROVED'
    and submission.reimbursement=true
) reimbursement on true
left join lateral (
  select sum(payment.amount) as total
  from public.staff_reimbursement_payments payment
  join public.staff_expense_submissions submission
    on submission.id=payment.staff_expense_submission_id
  where payment.settlement_id=settlement.id
    and submission.staff_id=settlement.staff_id
    and submission.project_id=settlement.project_id
    and submission.status='APPROVED'
    and submission.reimbursement=true
) reimbursement_payment on true
where settlement.deleted_at is null
  and settlement.status='CONFIRMED';

-- Refresh only open derived accounts for September 2026. Finalized/paid
-- accounts and all source transactions remain untouched.
do $$
declare
  item record;
begin
  for item in
    select staff_id, accounting_month
    from public.staff_monthly_accounts
    where accounting_month='2026-09-01'
      and settlement_status<>'FINALIZED'
      and payment_status<>'PAID'
  loop
    perform public.ensure_staff_monthly_account(item.staff_id,item.accounting_month);
  end loop;
end $$;

-- Regression guard: an approved submission remains visible even when its
-- materialized expense has an operational scope rather than reimbursement scope.
do $$
declare
  reimbursement numeric;
begin
  select reimbursement_total into reimbursement
  from public.staff_settlement_financials
  where settlement_id='89532e19-c946-4129-8b69-54f9653e2dd7';
  if coalesce(reimbursement,0)<>13599 then
    raise exception 'Approved reimbursement projection regression: expected 13599, got %', reimbursement;
  end if;
end $$;

commit;

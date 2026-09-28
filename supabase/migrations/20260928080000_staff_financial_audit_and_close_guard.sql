begin;

create or replace function public.staff_month_financial_audit(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  month_start date:=date_trunc('month',p_month)::date;
  critical_errors jsonb:='[]'::jsonb;
  warnings jsonb:='[]'::jsonb;
  reviewed integer:=0;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') not in ('service_role')
    and current_user not in ('postgres','supabase_admin')
    and (auth.uid() is null or not public.can_administer()) then
    raise exception 'Solo Founder o Administración puede auditar el cierre mensual.';
  end if;

  select count(distinct payment.staff_id) into reviewed
  from public.event_staff_payments payment
  where payment.accounting_month=month_start
    and payment.status='CONFIRMED'
    and payment.deleted_at is null;

  select coalesce(jsonb_agg(finding order by finding->>'code'),'[]'::jsonb)
  into critical_errors
  from (
    select jsonb_build_object(
      'code','ACCOUNT_WORK_TOTAL_MISMATCH','severity','RED','staffId',account.staff_id,
      'accountId',account.id,'expected',calc->>'workNet','actual',account.work_net,
      'message','La cuenta mensual no coincide con event_staff_payments.') finding
    from public.staff_monthly_accounts account
    cross join lateral public.calculate_staff_monthly_settlement(account.staff_id,month_start) calc
    where account.accounting_month=month_start
      and abs(coalesce(account.work_net,0)-coalesce((calc->>'workNet')::numeric,0))>0.01

    union all
    select jsonb_build_object(
      'code','BOLETA_BASE_MISMATCH','severity','RED','staffId',account.staff_id,
      'accountId',account.id,'expected',calc->>'workNet','actual',account.boleta_net,
      'message','La base neta de boleta no coincide con el trabajo total.')
    from public.staff_monthly_accounts account
    cross join lateral public.calculate_staff_monthly_settlement(account.staff_id,month_start) calc
    where account.accounting_month=month_start
      and abs(coalesce(account.boleta_net,0)-coalesce((calc->>'workNet')::numeric,0))>0.01

    union all
    select jsonb_build_object(
      'code','FINAL_TRANSFER_MISMATCH','severity','RED','staffId',account.staff_id,
      'accountId',account.id,'expected',calc->>'finalTransferAmount','actual',account.final_transfer_amount,
      'message','El saldo final no coincide con el ledger canónico.')
    from public.staff_monthly_accounts account
    cross join lateral public.calculate_staff_monthly_settlement(account.staff_id,month_start) calc
    where account.accounting_month=month_start
      and abs(coalesce(account.final_transfer_amount,0)-coalesce((calc->>'finalTransferAmount')::numeric,0))>0.01

    union all
    select jsonb_build_object(
      'code','SETTLEMENT_OVERPAID','severity','RED','settlementId',payment.id,
      'staffId',payment.staff_id,'obligation',payment.total_internal_payment,'paid',paid.total_paid,
      'message','El pago imputado supera la obligación del evento.')
    from public.event_staff_payments payment
    cross join lateral (
      select coalesce(sum(case when movement.movement_type in ('ADVANCE','PAYMENT') then movement.amount when movement.movement_type='REVERSAL' then -movement.amount else 0 end),0) total_paid
      from public.event_staff_settlement_movements movement
      where movement.settlement_id=payment.id and movement.deleted_at is null
    ) paid
    where payment.accounting_month=month_start and payment.status='CONFIRMED' and payment.deleted_at is null
      and paid.total_paid>coalesce(payment.total_internal_payment,0)+0.01

    union all
    select jsonb_build_object(
      'code','DUPLICATE_ACTIVE_SETTLEMENT','severity','RED','staffId',payment.staff_id,
      'projectId',payment.project_id,'count',count(*),
      'message','Existe más de un settlement activo para el mismo evento y Staff.')
    from public.event_staff_payments payment
    where payment.accounting_month=month_start and payment.status='CONFIRMED' and payment.deleted_at is null
    group by payment.staff_id,payment.project_id having count(*)>1

    union all
    select jsonb_build_object(
      'code','DUPLICATE_REIMBURSEMENT','severity','RED','expenseId',payment.expense_id,
      'count',count(*),'message','Un gasto tiene más de un pago de reembolso.')
    from public.staff_reimbursement_payments payment
    group by payment.expense_id having count(*)>1

    union all
    select jsonb_build_object(
      'code','REIMBURSEMENT_OVER_EXPENSE','severity','RED','expenseId',payment.expense_id,
      'paid',sum(payment.amount),'approved',expense.total,
      'message','Los reembolsos pagados superan el gasto aprobado.')
    from public.staff_reimbursement_payments payment
    join public.expenses expense on expense.id=payment.expense_id
    group by payment.expense_id,expense.total having sum(payment.amount)>expense.total+0.01

    union all
    select jsonb_build_object(
      'code','SETTLEMENT_IN_FINALIZED_OTHER_PERIOD','severity','RED','settlementId',payment.id,
      'accountId',account.id,'paymentMonth',payment.accounting_month,'finalizedMonth',account.accounting_month,
      'message','El settlement aparece congelado en otro período finalizado.')
    from public.event_staff_payments payment
    join public.staff_monthly_accounts account on account.staff_id=payment.staff_id and account.settlement_status='FINALIZED'
    cross join lateral jsonb_array_elements(coalesce(account.finalized_snapshot->'details','[]'::jsonb)) detail
    where detail->>'settlementId'=payment.id::text
      and account.accounting_month is distinct from payment.accounting_month
  ) findings;

  select coalesce(jsonb_agg(finding order by finding->>'code'),'[]'::jsonb)
  into warnings
  from (
    select jsonb_build_object(
      'code','ZERO_VALUE_ACCOUNT','severity','YELLOW','staffId',account.staff_id,'accountId',account.id,
      'message','Staff sin trabajo confirmado en el período; se excluye sin bloquear al resto.') finding
    from public.staff_monthly_accounts account
    where account.accounting_month=month_start and coalesce(account.work_net,0)<=0
  ) findings;

  return jsonb_build_object(
    'month',month_start,
    'staffReviewed',reviewed,
    'criticalErrors',critical_errors,
    'warnings',warnings,
    'criticalErrorCount',jsonb_array_length(critical_errors),
    'warningCount',jsonb_array_length(warnings),
    'monthCloseCanProceed',jsonb_array_length(critical_errors)=0
  );
end;
$$;

comment on function public.staff_month_financial_audit(date) is
  'Read-only pre-close audit over canonical Staff payment, movement and reimbursement ledgers.';

revoke all on function public.staff_month_financial_audit(date) from public,anon;
grant execute on function public.staff_month_financial_audit(date) to authenticated,service_role;

commit;

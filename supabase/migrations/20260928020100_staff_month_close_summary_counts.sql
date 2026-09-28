begin;

create or replace function public.preview_staff_monthly_close(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  month_start date:=date_trunc('month',p_month)::date;
  close_row public.staff_monthly_closes%rowtype;
  people integer:=0;
  settlements integer:=0;
  excluded_zero integer:=0;
  totals jsonb;
begin
  if auth.uid() is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede revisar el cierre mensual.';
  end if;
  select * into close_row from public.staff_monthly_closes where accounting_month=month_start;
  select count(*) filter(where staff_total>0),count(*) filter(where staff_total<=0)
  into people,excluded_zero
  from (
    select payment.staff_id,coalesce(sum(payment.total_internal_payment),0) as staff_total
    from public.event_staff_payments payment
    where payment.accounting_month=month_start and payment.status='CONFIRMED' and payment.deleted_at is null
    group by payment.staff_id
  ) grouped_staff;
  select count(*) into settlements
  from public.event_staff_payments payment
  where payment.accounting_month=month_start and payment.status='CONFIRMED' and payment.deleted_at is null;
  select jsonb_build_object(
    'people',count(distinct account.staff_id),'settlements',coalesce(sum(account.event_count),0),
    'original',coalesce(sum(account.work_net),0),'adjustments',0,
    'reimbursements',coalesce(sum(account.reimbursements_total),0),
    'total',coalesce(sum(account.final_transfer_amount),0),'paid',coalesce(sum(account.paid_amount),0),
    'pending',coalesce(sum(greatest(account.final_transfer_amount-coalesce(account.paid_amount,0),0)),0),
    'receiptsPending',count(*) filter(where account.boleta_status<>'RECEIVED')
  ) into totals from public.staff_monthly_accounts account where account.accounting_month=month_start;
  return jsonb_build_object('month',month_start,'status',coalesce(close_row.status,'OPEN'),
    'dueDate',month_start+24,'version',coalesce(close_row.close_version,0),
    'eligible',people,'ineligible',excluded_zero,'excludedZeroValue',excluded_zero,
    'operationalBlockers',0,'canonicalSettlements',settlements,'totals',coalesce(totals,'{}'::jsonb));
end;
$$;

revoke all on function public.preview_staff_monthly_close(date) from public,anon;
grant execute on function public.preview_staff_monthly_close(date) to authenticated,service_role;
commit;

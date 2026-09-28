begin;

-- The monthly close is a financial decision. Operational event closure is not
-- a prerequisite when a canonical confirmed staff payment exists.
create or replace function public.preview_staff_monthly_close(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
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

  select * into close_row
  from public.staff_monthly_closes
  where accounting_month=month_start;

  select count(*) filter(where staff_total>0), count(*) filter(where staff_total<=0)
  into people,excluded_zero
  from (
    select payment.staff_id,coalesce(sum(payment.total_internal_payment),0) as staff_total
    from public.event_staff_payments payment
    where payment.accounting_month=month_start
      and payment.status='CONFIRMED'
      and payment.deleted_at is null
    group by payment.staff_id
  ) grouped_staff;

  select count(*) into settlements
  from public.event_staff_payments payment
  where payment.accounting_month=month_start
    and payment.status='CONFIRMED'
    and payment.deleted_at is null;

  select jsonb_build_object(
    'people',count(distinct account.staff_id),
    'settlements',coalesce(sum(account.event_count),0),
    'original',coalesce(sum(account.work_net),0),
    'adjustments',0,
    'reimbursements',coalesce(sum(account.reimbursements_total),0),
    'total',coalesce(sum(account.final_transfer_amount),0),
    'paid',coalesce(sum(account.paid_amount),0),
    'pending',coalesce(sum(greatest(account.final_transfer_amount-coalesce(account.paid_amount,0),0)),0),
    'receiptsPending',count(*) filter(where account.boleta_status<>'RECEIVED')
  ) into totals
  from public.staff_monthly_accounts account
  where account.accounting_month=month_start;

  return jsonb_build_object(
    'month',month_start,
    'status',coalesce(close_row.status,'OPEN'),
    'dueDate',month_start+24,
    'version',coalesce(close_row.close_version,0),
    'eligible',greatest(people-excluded_zero,0),
    'ineligible',excluded_zero,
    'excludedZeroValue',excluded_zero,
    'operationalBlockers',0,
    'totals',coalesce(totals,'{}'::jsonb)
  );
end;
$$;

create or replace function public.close_staff_month(p_month date)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  month_start date:=date_trunc('month',p_month)::date;
  close_row public.staff_monthly_closes%rowtype;
  account_row public.staff_monthly_accounts%rowtype;
  next_version integer;
  summary jsonb;
  account_count integer:=0;
  finalized_count integer:=0;
  excluded_count integer:=0;
  blocker text;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede cerrar el mes.';
  end if;

  perform public.generate_staff_monthly_accounts(month_start);
  insert into public.staff_monthly_closes(accounting_month,due_date)
  values(month_start,month_start+24)
  on conflict(accounting_month) do nothing;

  select * into close_row
  from public.staff_monthly_closes
  where accounting_month=month_start
  for update;

  if close_row.status in('CLOSED','PAID') then
    return public.preview_staff_monthly_close(month_start);
  end if;
  if close_row.status not in('OPEN','REOPENED') then
    raise exception 'El mes no está disponible para cierre.';
  end if;

  select count(*) into account_count
  from public.staff_monthly_accounts
  where accounting_month=month_start;
  if account_count=0 then
    raise exception 'No existen liquidaciones Staff para el período.';
  end if;

  -- Only real financial inconsistencies block. Pending operational closures,
  -- checklists and event_operational_closures are intentionally ignored here.
  select format('%s: %s',account.staff_id,coalesce(account.review_reason,'revisión financiera requerida'))
  into blocker
  from public.staff_monthly_accounts account
  where account.accounting_month=month_start
    and account.work_net>0
    and account.review_required
  limit 1;
  if blocker is not null then
    raise exception 'Cierre mensual bloqueado por inconsistencia financiera: %',blocker;
  end if;

  next_version:=close_row.close_version+1;

  for account_row in
    select * from public.staff_monthly_accounts
    where accounting_month=month_start
    order by staff_id
    for update
  loop
    if account_row.work_net<=0 then
      excluded_count:=excluded_count+1;
      update public.staff_monthly_accounts
      set review_required=false,
          review_reason='Excluida del cierre mensual: valor de trabajo confirmado igual a cero.',
          updated_at=now()
      where id=account_row.id and settlement_status<>'FINALIZED' and payment_status<>'PAID';
      insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
      values(account_row.id,'EXCLUDED_ZERO_VALUE',actor,
        'Excluida del cierre mensual sin bloquear al resto del Staff.',
        coalesce(account_row.calculation,'{}'::jsonb));
      continue;
    end if;

    if account_row.settlement_status<>'FINALIZED' then
      update public.staff_monthly_accounts
      set settlement_status='FINALIZED',finalized_at=now(),finalized_by=actor,
          finalized_snapshot=calculation,updated_at=now()
      where id=account_row.id;
      insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state)
      values(account_row.id,'FINALIZED',actor,coalesce(account_row.calculation,'{}'::jsonb));
    end if;
    finalized_count:=finalized_count+1;
  end loop;

  summary:=public.preview_staff_monthly_close(month_start);
  summary:=summary || jsonb_build_object(
    'status','CLOSED',
    'version',next_version,
    'finalizedStaff',finalized_count,
    'excludedStaff',excluded_count,
    'closeRule','CONFIRMED_EVENT_STAFF_PAYMENTS',
    'operationalCloseRequired',false
  );

  insert into public.staff_monthly_close_items(
    monthly_close_id,close_version,settlement_id,staff_id,project_id,
    settlement_snapshot,eligibility_override_reason
  )
  select close_row.id,next_version,payment.id,payment.staff_id,payment.project_id,
    to_jsonb(payment),null
  from public.event_staff_payments payment
  where payment.accounting_month=month_start
    and payment.status='CONFIRMED'
    and payment.deleted_at is null
    and payment.total_internal_payment>0
  on conflict do nothing;

  update public.staff_monthly_closes
  set status='CLOSED',close_version=next_version,summary_snapshot=summary,
      closed_at=now(),closed_by=actor,reopened_at=null,reopened_by=null,
      reopen_reason=null,updated_at=now()
  where id=close_row.id;

  return summary;
end;
$$;

comment on function public.close_staff_month(date) is
  'Closes Staff finance from confirmed event_staff_payments; operational event closure is not a monthly-close gate.';

revoke all on function public.preview_staff_monthly_close(date),public.close_staff_month(date) from public,anon;
grant execute on function public.preview_staff_monthly_close(date),public.close_staff_month(date) to authenticated,service_role;

commit;

begin;

-- The canonical monthly work base is the active event payment ledger grouped
-- by its explicit accounting month. Financial projections remain useful for
-- reimbursements and display details, but never define honorarium work.
create or replace function public.calculate_staff_monthly_settlement(p_staff_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  month_start date:=date_trunc('month',p_month)::date;
  rate numeric:=public.staff_withholding_rate_for_period(month_start);
  work_total numeric:=0; reimbursement_total numeric:=0; advances numeric:=0;
  gross_amount numeric:=0; retention numeric:=0; cash_obligation numeric:=0;
  final_transfer numeric:=0; excess numeric:=0; event_total integer:=0;
  details jsonb:='[]'::jsonb;
begin
  select coalesce(sum(settlement.total_internal_payment),0),
    coalesce(sum(coalesce(financial.reimbursement_total,0)),0),count(*),
    coalesce(jsonb_agg(jsonb_build_object(
      'settlementId',settlement.id,'projectId',project.id,'eventDate',project.event_date,
      'event',project.name,'customer',customer.full_name,
      'service',coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type),
      'location',concat_ws(' · ',nullif(project.location,''),nullif(project.city,'')),
      'roles',settlement.tasks,
      'hours',coalesce((select max(service.duration_hours) from public.project_services service where service.project_id=project.id),(project.operations->>'durationHours')::numeric,0),
      'workNet',settlement.total_internal_payment,'reimbursements',coalesce(financial.reimbursement_total,0),
      'advances',coalesce((select sum(case when movement.movement_type='ADVANCE' then movement.amount when movement.movement_type='REVERSAL' then -movement.amount else 0 end)
        from public.event_staff_settlement_movements movement where movement.settlement_id=settlement.id and movement.deleted_at is null),0)
    ) order by settlement.accounting_month,project.event_date,project.event_time,settlement.id),'[]'::jsonb)
  into work_total,reimbursement_total,event_total,details
  from public.event_staff_payments settlement
  join public.projects project on project.id=settlement.project_id
  left join public.customers customer on customer.id=project.customer_id
  left join public.staff_settlement_financials financial on financial.settlement_id=settlement.id
  where settlement.staff_id=p_staff_id and settlement.accounting_month=month_start
    and settlement.deleted_at is null and settlement.status='CONFIRMED'
    and project.deleted_at is null;

  select coalesce(sum(case when movement.movement_type='ADVANCE' then movement.amount when movement.movement_type='REVERSAL' then -movement.amount else 0 end),0)
  into advances
  from public.event_staff_settlement_movements movement
  join public.event_staff_payments settlement on settlement.id=movement.settlement_id
  where settlement.staff_id=p_staff_id and settlement.accounting_month=month_start
    and movement.deleted_at is null and settlement.deleted_at is null and settlement.status='CONFIRMED';
  advances:=greatest(advances,0);

  if rate is not null and work_total>0 then gross_amount:=round(work_total/(1-rate),0); end if;
  retention:=greatest(gross_amount-work_total,0);
  cash_obligation:=work_total+reimbursement_total;
  final_transfer:=greatest(cash_obligation-advances,0);
  excess:=greatest(advances-cash_obligation,0);
  return jsonb_build_object(
    'source','CANONICAL_STAFF_MONTHLY_SETTLEMENT_V3','rateSemantics','NET','periodSource','ACCOUNTING_MONTH','rounding','ROUND_CLP_HALF_AWAY_FROM_ZERO',
    'staffId',p_staff_id,'month',month_start,'eventCount',event_total,'details',details,
    'workNet',work_total,'boletaGross',gross_amount,'withholdingRate',coalesce(rate,0)*100,
    'withholdingAmount',retention,'boletaNet',work_total,'reimbursementsTotal',reimbursement_total,
    'advancesTotal',advances,'cashObligation',cash_obligation,'finalTransferAmount',final_transfer,'excessAdvance',excess,
    'reviewRequired',(rate is null or excess>0),
    'reviewReason',concat_ws(' · ',case when rate is null then 'Falta tasa de retención efectiva para el período' end,case when excess>0 then 'Adelantos exceden la obligación mensual' end)
  );
end $$;

-- Candidate discovery must use the same accounting-month source as the
-- calculation, otherwise valid ledger rows can never create an account.
create or replace function public.generate_staff_monthly_accounts(p_month date)
returns integer language plpgsql security definer set search_path=public as $$
declare month_start date:=date_trunc('month',p_month)::date; member record; generated integer:=0;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede generar liquidaciones.'; end if;
  for member in
    select distinct payment.staff_id from public.event_staff_payments payment
    where payment.deleted_at is null and payment.status='CONFIRMED' and payment.accounting_month=month_start
  loop
    perform public.ensure_staff_monthly_account(member.staff_id,month_start);
    generated:=generated+1;
  end loop;
  return generated;
end $$;

-- Repair or create all non-finalized accounts from the canonical ledger. This
-- is idempotent and intentionally does not rewrite paid accounts' amounts.
do $$
declare row record; calc jsonb; account_id uuid;
begin
  for row in
    select distinct payment.staff_id,payment.accounting_month
    from public.event_staff_payments payment
    where payment.deleted_at is null and payment.status='CONFIRMED' and payment.accounting_month is not null
  loop
    calc:=public.calculate_staff_monthly_settlement(row.staff_id,row.accounting_month);
    insert into public.staff_monthly_accounts(staff_id,accounting_month,expected_amount)
    values(row.staff_id,row.accounting_month,(calc->>'finalTransferAmount')::numeric)
    on conflict(staff_id,accounting_month) do nothing
    returning id into account_id;
    if account_id is null then
      select id into account_id from public.staff_monthly_accounts where staff_id=row.staff_id and accounting_month=row.accounting_month;
    end if;
    update public.staff_monthly_accounts
    set expected_amount=(calc->>'finalTransferAmount')::numeric,
        work_net=(calc->>'workNet')::numeric,
        boleta_gross=(calc->>'boletaGross')::numeric,
        withholding_rate=(calc->>'withholdingRate')::numeric,
        withholding_amount=(calc->>'withholdingAmount')::numeric,
        boleta_net=(calc->>'boletaNet')::numeric,
        advances_total=(calc->>'advancesTotal')::numeric,
        reimbursements_total=(calc->>'reimbursementsTotal')::numeric,
        final_transfer_amount=(calc->>'finalTransferAmount')::numeric,
        excess_advance=(calc->>'excessAdvance')::numeric,
        event_count=(calc->>'eventCount')::integer,
        calculation=calc,
        review_required=(calc->>'reviewRequired')::boolean,
        review_reason=nullif(calc->>'reviewReason',''),
        updated_at=now()
    where id=account_id and settlement_status<>'FINALIZED' and payment_status<>'PAID';
    insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
    select account_id,'REFRESHED',null,'Reconciliación desde event_staff_payments por accounting_month.',calc
    where exists(select 1 from public.staff_monthly_accounts where id=account_id and settlement_status<>'FINALIZED' and payment_status<>'PAID');
  end loop;
end $$;

-- A recorded payment is necessarily the terminal settlement transition. Keep
-- its amount and documents untouched, but repair the missing finalized state
-- with an explicit audit entry and the existing calculation snapshot.
update public.staff_monthly_accounts
set settlement_status='FINALIZED',
    finalized_at=coalesce(finalized_at,paid_at::timestamptz,updated_at),
    finalized_snapshot=coalesce(finalized_snapshot,calculation),
    updated_at=now()
where payment_status='PAID' and settlement_status='DRAFT';

insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
select id,'FINALIZED',null,'Reparación auditada: pago registrado con settlement DRAFT; se completó la transición a FINALIZED sin alterar el pago.',coalesce(finalized_snapshot,calculation,'{}'::jsonb)
from public.staff_monthly_accounts
where payment_status='PAID' and settlement_status='FINALIZED'
  and not exists(select 1 from public.staff_monthly_settlement_audit audit where audit.account_id=staff_monthly_accounts.id and audit.action='FINALIZED' and audit.reason like 'Reparación auditada: pago registrado%');

alter table public.staff_monthly_accounts drop constraint if exists staff_monthly_accounts_paid_requires_finalized;
alter table public.staff_monthly_accounts add constraint staff_monthly_accounts_paid_requires_finalized
  check (payment_status<>'PAID' or settlement_status='FINALIZED');

commit;

begin;

-- Monthly settlement calculations must always expose numeric reimbursement
-- fields. The account columns are NOT NULL and consumers rely on these keys.
create or replace function public.calculate_staff_monthly_settlement(p_staff_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  month_start date:=date_trunc('month',p_month)::date;
  rate numeric:=public.staff_withholding_rate_for_period(month_start);
  work_total numeric:=0; reimbursement_total numeric:=0; reimbursement_paid numeric:=0; reimbursement_pending numeric:=0; advances numeric:=0;
  gross_amount numeric:=0; retention numeric:=0; cash_obligation numeric:=0;
  final_transfer numeric:=0; excess numeric:=0; event_total integer:=0;
  details jsonb:='[]'::jsonb;
begin
  select coalesce(sum(settlement.total_internal_payment),0),
    coalesce(sum(coalesce(financial.reimbursement_total,0)),0),
    coalesce(sum(coalesce(financial.reimbursement_paid_amount,0)),0),
    coalesce(sum(coalesce(financial.reimbursement_pending_amount,0)),0),
    count(*),
    coalesce(jsonb_agg(jsonb_build_object(
      'settlementId',settlement.id,'projectId',project.id,'eventDate',project.event_date,
      'event',project.name,'customer',customer.full_name,
      'service',coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type),
      'location',concat_ws(' · ',nullif(project.location,''),nullif(project.city,'')),
      'roles',settlement.tasks,
      'hours',coalesce((select max(service.duration_hours) from public.project_services service where service.project_id=project.id),(project.operations->>'durationHours')::numeric,0),
      'workNet',settlement.total_internal_payment,
      'reimbursements',coalesce(financial.reimbursement_total,0),
      'reimbursementsPaid',coalesce(financial.reimbursement_paid_amount,0),
      'reimbursementsPending',coalesce(financial.reimbursement_pending_amount,0),
      'advances',coalesce((select sum(case when movement.movement_type='ADVANCE' then movement.amount when movement.movement_type='REVERSAL' then -movement.amount else 0 end)
        from public.event_staff_settlement_movements movement where movement.settlement_id=settlement.id and movement.deleted_at is null),0)
    ) order by settlement.accounting_month,project.event_date,project.event_time,settlement.id),'[]'::jsonb)
  into work_total,reimbursement_total,reimbursement_paid,reimbursement_pending,event_total,details
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
    'withholdingAmount',retention,'boletaNet',work_total,
    'reimbursementsTotal',coalesce(reimbursement_total,0),
    'reimbursementsPaidTotal',coalesce(reimbursement_paid,0),
    'reimbursementsPendingTotal',coalesce(reimbursement_pending,0),
    'advancesTotal',advances,'cashObligation',cash_obligation,'finalTransferAmount',final_transfer,'excessAdvance',excess,
    'reviewRequired',(rate is null or excess>0),
    'reviewReason',concat_ws(' · ',case when rate is null then 'Falta tasa de retención efectiva para el período' end,case when excess>0 then 'Adelantos exceden la obligación mensual' end)
  );
end $$;

-- Re-run the existing canonical account writer so affected accounts receive
-- zero values through the same guarded path; paid amounts/documents remain untouched.
do $$
declare row record;
begin
  update public.staff_monthly_accounts
  set reimbursements_total=coalesce(reimbursements_total,0),
      reimbursements_paid_total=coalesce(reimbursements_paid_total,0),
      reimbursements_pending_total=coalesce(reimbursements_pending_total,0),
      updated_at=now();
  for row in select staff_id,accounting_month from public.staff_monthly_accounts loop
    perform public.ensure_staff_monthly_account(row.staff_id,row.accounting_month);
  end loop;
end $$;

commit;

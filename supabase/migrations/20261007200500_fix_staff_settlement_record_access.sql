begin;

+create or replace function public.calculate_staff_monthly_settlement(
  p_staff_id uuid,
  p_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  rate numeric := public.staff_withholding_rate_for_period(month_start);
  work_total numeric := 0;
  work_paid numeric := 0;
  work_pending numeric := 0;
  work_overpayment numeric := 0;
  upcoming_total numeric := 0;
  reimbursement_total numeric := 0;
  reimbursement_paid numeric := 0;
  reimbursement_pending numeric := 0;
  reimbursement_overpayment numeric := 0;
  advances numeric := 0;
  payments numeric := 0;
  gross_amount numeric := 0;
  retention numeric := 0;
  cash_obligation numeric := 0;
  final_transfer numeric := 0;
  excess numeric := 0;
  event_total integer := 0;
  paid_field_mismatch_count integer := 0;
  paid_status_mismatch_count integer := 0;
  details jsonb := '[]'::jsonb;
  upcoming_details jsonb := '[]'::jsonb;
begin
  with base as (
    select
      settlement,
      project,
      customer,
      financial,
      movement,
      public.staff_payment_is_realized((settlement).project_id, (settlement).assignment_id, (project).event_date) as realized
    from public.event_staff_payments settlement
    join public.projects project on (project).id = (settlement).project_id
    left join public.customers customer on (customer).id = (project).customer_id
    left join public.staff_settlement_financials financial on (financial).settlement_id = (settlement).id
    left join lateral (
      select
        coalesce(sum(case when (movement).movement_type in ('ADVANCE','PAYMENT') then (movement).amount when (movement).movement_type = 'REVERSAL' then -(movement).amount else 0 end), 0) as work_paid_raw,
        coalesce(sum(case when (movement).movement_type = 'ADVANCE' then (movement).amount when (movement).movement_type = 'REVERSAL' then -(movement).amount else 0 end), 0) as advances,
        coalesce(sum(case when (movement).movement_type = 'PAYMENT' then (movement).amount else 0 end), 0) as payments
      from public.event_staff_settlement_movements movement
      where (movement).settlement_id = (settlement).id and (movement).deleted_at is null
    ) movement on true
    where (settlement).staff_id = p_staff_id
      and (settlement).accounting_month = month_start
      and (settlement).deleted_at is null
      and (settlement).status <> 'CANCELLED'
      and (project).deleted_at is null
  )
  select
    coalesce(sum((settlement).total_internal_payment) filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum(greatest(least(greatest((movement).work_paid_raw, 0), coalesce((settlement).total_internal_payment, 0)), 0)) filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum(greatest(coalesce((settlement).total_internal_payment, 0) - greatest((movement).work_paid_raw, 0), 0)) filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum(greatest(greatest((movement).work_paid_raw, 0) - coalesce((settlement).total_internal_payment, 0), 0)) filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum((settlement).total_internal_payment) filter (where not realized and (settlement).status in ('ESTIMATED','CONFIRMED')), 0),
    coalesce(sum(coalesce((financial).reimbursement_total, 0)), 0),
    coalesce(sum(coalesce((financial).reimbursement_paid_amount, 0)), 0),
    coalesce(sum(greatest(coalesce((financial).reimbursement_total, 0) - coalesce((financial).reimbursement_paid_amount, 0), 0)), 0),
    coalesce(sum(greatest(coalesce((financial).reimbursement_paid_amount, 0) - coalesce((financial).reimbursement_total, 0), 0)), 0),
    coalesce(sum((movement).advances) filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum((movement).payments) filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    count(*) filter (where realized and (settlement).status = 'CONFIRMED'),
    count(*) filter (where realized and (settlement).status = 'CONFIRMED' and abs(coalesce((settlement).paid_amount, 0) - greatest((movement).work_paid_raw, 0)) > 0.01),
    count(*) filter (where realized and (settlement).status = 'CONFIRMED' and (settlement).settlement_status = 'PAID' and greatest(coalesce((settlement).total_internal_payment, 0) - greatest((movement).work_paid_raw, 0), 0) > 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'settlementId', (settlement).id,
      'projectId', (project).id,
      'eventDate', (project).event_date,
      'event', (project).name,
      'customer', (customer).full_name,
      'service', coalesce((select string_agg(service.service_code, ' + ' order by service.service_code) from public.project_services service where service.project_id = (project).id), (project).project_type),
      'location', concat_ws(' · ', nullif((project).location, ''), nullif((project).city, '')),
      'roles', (settlement).tasks,
      'hours', coalesce((select max(service.duration_hours) from public.project_services service where service.project_id = (project).id), ((project).operations->>'durationHours')::numeric, 0),
      'workNet', coalesce((settlement).total_internal_payment, 0),
      'workPaid', least(greatest((movement).work_paid_raw, 0), coalesce((settlement).total_internal_payment, 0)),
      'workPending', greatest(coalesce((settlement).total_internal_payment, 0) - greatest((movement).work_paid_raw, 0), 0),
      'workOverpayment', greatest(greatest((movement).work_paid_raw, 0) - coalesce((settlement).total_internal_payment, 0), 0),
      'paidAmountField', coalesce((settlement).paid_amount, 0),
      'advances', coalesce((movement).advances, 0),
      'payments', coalesce((movement).payments, 0),
      'reimbursements', coalesce((financial).reimbursement_total, 0),
      'reimbursementsPaid', coalesce((financial).reimbursement_paid_amount, 0),
      'reimbursementsPending', greatest(coalesce((financial).reimbursement_total, 0) - coalesce((financial).reimbursement_paid_amount, 0), 0),
      'reimbursementOverpayment', greatest(coalesce((financial).reimbursement_paid_amount, 0) - coalesce((financial).reimbursement_total, 0), 0),
      'settlementStatus', (settlement).settlement_status
    ) order by (project).event_date, (project).event_time, (settlement).id) filter (where realized and (settlement).status = 'CONFIRMED'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'settlementId', (settlement).id,
      'projectId', (project).id,
      'eventDate', (project).event_date,
      'event', (project).name,
      'customer', (customer).full_name,
      'roles', (settlement).tasks,
      'workNet', coalesce((settlement).total_internal_payment, 0),
      'status', (settlement).status,
      'assignmentId', (settlement).assignment_id,
      'blockId', (settlement).block_id
    ) order by (project).event_date, (project).event_time, (settlement).id) filter (where not realized and (settlement).status in ('ESTIMATED','CONFIRMED')), '[]'::jsonb)
  into work_total, work_paid, work_pending, work_overpayment, upcoming_total,
    reimbursement_total, reimbursement_paid, reimbursement_pending, reimbursement_overpayment,
    advances, payments, event_total, paid_field_mismatch_count, paid_status_mismatch_count,
    details, upcoming_details
  from base;

  advances := greatest(advances, 0);
  if rate is not null and work_total > 0 then gross_amount := round(work_total / (1 - rate), 0); end if;
  retention := greatest(gross_amount - work_total, 0);
  cash_obligation := work_pending + reimbursement_pending;
  final_transfer := greatest(cash_obligation, 0);
  excess := greatest(advances - work_total, 0);

  return jsonb_build_object(
    'source', 'CANONICAL_STAFF_MONTHLY_SETTLEMENT_V5',
    'rateSemantics', 'NET',
    'periodSource', 'ACCOUNTING_MONTH',
    'realizedRule', 'EVENT_DATE_OR_COMPLETED_ASSIGNMENT',
    'rounding', 'ROUND_CLP_HALF_AWAY_FROM_ZERO',
    'staffId', p_staff_id,
    'month', month_start,
    'eventCount', event_total,
    'details', details,
    'upcomingDetails', upcoming_details,
    'upcomingTotal', upcoming_total,
    'workNet', work_total,
    'workPaid', work_paid,
    'workPending', work_pending,
    'workOverpayment', work_overpayment,
    'boletaGross', gross_amount,
    'withholdingRate', coalesce(rate, 0) * 100,
    'withholdingAmount', retention,
    'boletaNet', work_total,
    'reimbursementsTotal', coalesce(reimbursement_total, 0),
    'reimbursementsPaidTotal', coalesce(reimbursement_paid, 0),
    'reimbursementsPendingTotal', coalesce(reimbursement_pending, 0),
    'reimbursementsOverpayment', coalesce(reimbursement_overpayment, 0),
    'advancesTotal', advances,
    'paymentsTotal', payments,
    'cashObligation', cash_obligation,
    'finalTransferAmount', final_transfer,
    'excessAdvance', excess,
    'reviewRequired', (rate is null or work_overpayment > 0 or reimbursement_overpayment > 0 or paid_field_mismatch_count > 0 or paid_status_mismatch_count > 0),
    'reviewReason', concat_ws(' · ',
      case when rate is null then 'Falta tasa de retención efectiva para el período' end,
      case when work_overpayment > 0 then 'Existen pagos de trabajo sobre la obligación del Evento' end,
      case when reimbursement_overpayment > 0 then 'Existen reembolsos pagados sobre gastos aprobados' end,
      case when paid_field_mismatch_count > 0 then 'paid_amount no coincide con movimientos imputables' end,
      case when paid_status_mismatch_count > 0 then 'Evento marcado PAID con saldo de trabajo pendiente' end)
  );
end;
$$;

commit;

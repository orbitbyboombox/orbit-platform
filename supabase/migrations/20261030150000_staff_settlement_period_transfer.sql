begin;

-- A period transfer changes only the accounting destination of one canonical
-- Staff settlement. It never changes the event date or reopens the source
-- monthly close.
create table if not exists public.staff_settlement_period_transfers(
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.event_staff_payments(id),
  staff_id uuid not null references public.staff(id),
  source_month date not null,
  target_month date not null,
  reason text not null,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','CANCELLED')),
  idempotency_key text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz,
  check(date_trunc('month', source_month)::date=source_month),
  check(date_trunc('month', target_month)::date=target_month),
  check(target_month>source_month),
  check(nullif(trim(reason),'') is not null),
  unique(settlement_id)
);
create index if not exists staff_settlement_period_transfers_target_idx
  on public.staff_settlement_period_transfers(staff_id,target_month)
  where status='ACTIVE';
alter table public.staff_settlement_period_transfers enable row level security;
drop policy if exists staff_settlement_period_transfers_admin_read on public.staff_settlement_period_transfers;
create policy staff_settlement_period_transfers_admin_read
  on public.staff_settlement_period_transfers for select to authenticated
  using(public.can_administer());
revoke all on public.staff_settlement_period_transfers from public,anon,authenticated;
grant select on public.staff_settlement_period_transfers to authenticated;

alter function public.calculate_staff_monthly_settlement(uuid,date)
  rename to calculate_staff_monthly_settlement_event_month;

-- Extend the canonical calculation without copying or replacing its existing
-- event-date logic. The wrapper adds only active transferred settlements.
create or replace function public.calculate_staff_monthly_settlement(p_staff_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  month_start date:=date_trunc('month',p_month)::date;
  base jsonb:=public.calculate_staff_monthly_settlement_event_month(p_staff_id,month_start);
  transfer record; financial record; movement record; adjustment numeric;
  obligation numeric; paid numeric; advances numeric; payments numeric;
  reimbursements numeric; reimbursements_paid numeric; detail jsonb;
  work_total numeric:=coalesce((base->>'workNet')::numeric,0);
  work_paid numeric:=coalesce((base->>'workPaid')::numeric,0);
  work_pending numeric:=coalesce((base->>'workPending')::numeric,0);
  advances_total numeric:=coalesce((base->>'advancesTotal')::numeric,0);
  payments_total numeric:=coalesce((base->>'paymentsTotal')::numeric,0);
  reimbursements_total numeric:=coalesce((base->>'reimbursementsTotal')::numeric,0);
  reimbursements_paid_total numeric:=coalesce((base->>'reimbursementsPaidTotal')::numeric,0);
  event_count integer:=coalesce((base->>'eventCount')::integer,0);
  rate numeric:=coalesce(public.staff_withholding_rate_for_period(month_start),0);
begin
  for transfer in
    select t.*, payment.project_id, payment.tasks, payment.total_internal_payment,
           project.event_date, project.event_time, project.name, project.customer_id,
           project.location, project.city, project.operations, project.project_type,
           customer.full_name
    from public.staff_settlement_period_transfers t
    join public.event_staff_payments payment on payment.id=t.settlement_id
    join public.projects project on project.id=payment.project_id
    left join public.customers customer on customer.id=project.customer_id
    where t.staff_id=p_staff_id and t.target_month=month_start and t.status='ACTIVE'
      and payment.status='CONFIRMED' and payment.deleted_at is null
      and project.deleted_at is null
  loop
    select coalesce((
             select coalesce(financial.original_net,transfer.total_internal_payment,0)
                    +coalesce(financial.adjustment_total,0)
             from public.staff_settlement_financials financial
             where financial.settlement_id=transfer.settlement_id
           ),transfer.total_internal_payment,0),
           coalesce((select financial.reimbursement_total
             from public.staff_settlement_financials financial
             where financial.settlement_id=transfer.settlement_id),0),
           coalesce((select financial.reimbursement_paid_amount
             from public.staff_settlement_financials financial
             where financial.settlement_id=transfer.settlement_id),0)
      into obligation,reimbursements,reimbursements_paid;
    obligation:=coalesce(obligation,0);
    select coalesce(sum(case when m.movement_type in ('ADVANCE','PAYMENT') then m.amount
                             when m.movement_type='REVERSAL' then -m.amount else 0 end),0),
           coalesce(sum(case when m.movement_type='ADVANCE' then m.amount
                             when m.movement_type='REVERSAL' then -m.amount else 0 end),0),
           coalesce(sum(case when m.movement_type='PAYMENT' then m.amount else 0 end),0)
      into paid,advances,payments
      from public.event_staff_settlement_movements m
      where m.settlement_id=transfer.settlement_id and m.deleted_at is null;
    paid:=greatest(coalesce(paid,0),0);
    advances:=greatest(coalesce(advances,0),0);
    payments:=greatest(coalesce(payments,0),0);
    select coalesce(sum(a.amount),0) into adjustment
      from public.event_staff_settlement_adjustments a
      where a.settlement_id=transfer.settlement_id and a.amount<>0;
    obligation:=obligation+coalesce(adjustment,0);
    work_total:=work_total+obligation;
    work_paid:=work_paid+least(paid,obligation);
    work_pending:=work_pending+greatest(obligation-paid,0);
    advances_total:=advances_total+advances;
    payments_total:=payments_total+payments;
    reimbursements_total:=reimbursements_total+coalesce(reimbursements,0);
    reimbursements_paid_total:=reimbursements_paid_total+coalesce(reimbursements_paid,0);
    event_count:=event_count+1;
    detail:=jsonb_build_object(
      'settlementId',transfer.settlement_id,'projectId',transfer.project_id,
      'eventDate',transfer.event_date,'event',transfer.name,
      'customer',transfer.full_name,
      'service',coalesce((select string_agg(s.service_code,' + ' order by s.service_code)
        from public.project_services s where s.project_id=transfer.project_id),transfer.project_type),
      'location',concat_ws(' · ',nullif(transfer.location,''),nullif(transfer.city,'')),
      'roles',transfer.tasks,
      'hours',coalesce((select max(s.duration_hours) from public.project_services s where s.project_id=transfer.project_id),(transfer.operations->>'durationHours')::numeric,0),
      'workNet',obligation,'baseWorkNet',transfer.total_internal_payment,
      'workPaid',least(paid,obligation),'workPending',greatest(obligation-paid,0),
      'advances',advances,'payments',payments,
      'reimbursements',coalesce(reimbursements,0),
      'reimbursementsPaid',coalesce(reimbursements_paid,0),
      'reimbursementsPending',greatest(coalesce(reimbursements,0)-coalesce(reimbursements_paid,0),0),
      'periodTransfer',true,'sourceMonth',transfer.source_month,'targetMonth',transfer.target_month,
      'transferReason',transfer.reason
    );
    base:=jsonb_set(base,'{details}',coalesce(base->'details','[]'::jsonb)||jsonb_build_array(detail),true);
  end loop;
  if event_count <> coalesce((base->>'eventCount')::integer,0) then
    base:=jsonb_set(base,'{workNet}',to_jsonb(work_total),true);
    base:=jsonb_set(base,'{workPaid}',to_jsonb(work_paid),true);
    base:=jsonb_set(base,'{workPending}',to_jsonb(work_pending),true);
    base:=jsonb_set(base,'{advancesTotal}',to_jsonb(advances_total),true);
    base:=jsonb_set(base,'{paymentsTotal}',to_jsonb(payments_total),true);
    base:=jsonb_set(base,'{reimbursementsTotal}',to_jsonb(reimbursements_total),true);
    base:=jsonb_set(base,'{reimbursementsPaidTotal}',to_jsonb(reimbursements_paid_total),true);
    base:=jsonb_set(base,'{reimbursementsPendingTotal}',to_jsonb(greatest(reimbursements_total-reimbursements_paid_total,0)),true);
    base:=jsonb_set(base,'{finalTransferAmount}',to_jsonb(greatest(work_pending+greatest(reimbursements_total-reimbursements_paid_total,0),0)),true);
    base:=jsonb_set(base,'{boletaNet}',to_jsonb(work_total),true);
    base:=jsonb_set(base,'{boletaGross}',to_jsonb(case when rate>0 then round(work_total/(1-rate),0) else work_total end),true);
    base:=jsonb_set(base,'{withholdingAmount}',to_jsonb(greatest((case when rate>0 then round(work_total/(1-rate),0) else work_total end)-work_total,0)),true);
    base:=jsonb_set(base,'{eventCount}',to_jsonb(event_count),true);
    base:=jsonb_set(base,'{source}','"CANONICAL_STAFF_MONTHLY_SETTLEMENT_V7_PERIOD_TRANSFER"'::jsonb,true);
    base:=jsonb_set(base,'{periodSource}','"EVENT_DATE_WITH_EXPLICIT_PERIOD_TRANSFER"'::jsonb,true);
  end if;
  return base;
end;
$$;

revoke all on function public.calculate_staff_monthly_settlement_event_month(uuid,date) from public,anon,authenticated;
revoke all on function public.calculate_staff_monthly_settlement(uuid,date) from public,anon,authenticated;
grant execute on function public.calculate_staff_monthly_settlement(uuid,date) to authenticated,service_role;

create or replace function public.register_staff_next_period_advance(
  p_settlement_id uuid,p_target_month date,p_amount numeric,p_date date,p_method text,
  p_reason text,p_idempotency_key text,p_receipt_bucket text,p_receipt_path text,
  p_receipt_file_name text,p_receipt_mime_type text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); settlement public.event_staff_payments%rowtype;
  source_account public.staff_monthly_accounts%rowtype; target_account public.staff_monthly_accounts%rowtype;
  project_row public.projects%rowtype; obligation numeric; paid numeric; receipt_id uuid; movement_id uuid;
  source_month date; target_month date:=date_trunc('month',p_target_month)::date;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede trasladar liquidaciones.'; end if;
  if coalesce(p_amount,0)<=0 or nullif(trim(coalesce(p_reason,'')),'') is null or nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Monto, motivo y clave idempotente son obligatorios.'; end if;
  select * into settlement from public.event_staff_payments where id=p_settlement_id and status='CONFIRMED' and deleted_at is null for update;
  if not found then raise exception 'Liquidación Staff confirmada no encontrada.'; end if;
  select * into project_row from public.projects where id=settlement.project_id and deleted_at is null;
  if not found then raise exception 'Evento Staff no encontrado.'; end if;
  source_month:=date_trunc('month',settlement.accounting_month)::date;
  if target_month<=source_month then raise exception 'El mes destino debe ser posterior al mes original.'; end if;
  if exists(select 1 from public.staff_settlement_period_transfers where settlement_id=settlement.id and status='ACTIVE') then raise exception 'Este evento ya fue trasladado a otro período.'; end if;
  if exists(select 1 from public.event_staff_settlement_movements where legacy_source='staff-next-period:'||p_idempotency_key and deleted_at is null) then
    select * into target_account from public.staff_monthly_accounts where staff_id=settlement.staff_id and accounting_month=target_month;
    return jsonb_build_object('idempotent',true,'settlementId',settlement.id,'accountId',target_account.id);
  end if;
  select * into source_account from public.staff_monthly_accounts where staff_id=settlement.staff_id and accounting_month=source_month for update;
  if not found or source_account.settlement_status<>'FINALIZED' or source_account.payment_status<>'PAID' then raise exception 'El mes original debe estar cerrado y pagado.'; end if;
  if exists(select 1 from public.staff_monthly_accounts where staff_id=settlement.staff_id and accounting_month=target_month and settlement_status='FINALIZED') then raise exception 'La liquidación del mes destino ya está cerrada.'; end if;
  select greatest(
    coalesce((select financial.original_net+coalesce(financial.adjustment_total,0)
      from public.staff_settlement_financials financial where financial.settlement_id=settlement.id),settlement.total_internal_payment,0)
    - coalesce((select sum(case when movement_type in ('ADVANCE','PAYMENT') then amount when movement_type='REVERSAL' then -amount else 0 end)
      from public.event_staff_settlement_movements where settlement_id=settlement.id and deleted_at is null),0),0)
    into obligation;
  if coalesce(obligation,0)<=0 then raise exception 'El monto real del evento no tiene saldo verificable.'; end if;
  if p_amount>obligation then raise exception 'El anticipo supera el saldo verificable del evento.'; end if;
  insert into public.staff_settlement_period_transfers(settlement_id,staff_id,source_month,target_month,reason,idempotency_key,created_by)
    values(settlement.id,settlement.staff_id,source_month,target_month,trim(p_reason),trim(p_idempotency_key),actor);
  insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
    values(null,settlement.staff_id,'STAFF_PAYMENT_RECEIPT','PAGOS',target_month,'Comprobante de anticipo · traspaso de período','ACTIVE',p_receipt_bucket,p_receipt_path,p_receipt_file_name,p_receipt_mime_type,actor)
    returning id into receipt_id;
  insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,receipt_path,notes,legacy_source,created_by,updated_by,receipt_document_id)
    values(settlement.id,'ADVANCE',p_amount,coalesce(p_date,current_date),nullif(trim(p_method),''),p_receipt_path,trim(p_reason),'staff-next-period:'||trim(p_idempotency_key),actor,actor,receipt_id)
    returning id into movement_id;
  select * into target_account from public.ensure_staff_monthly_account(settlement.staff_id,target_month);
  insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
    values(target_account.id,'REFRESHED',actor,trim(p_reason),jsonb_build_object('periodTransferId',(select id from public.staff_settlement_period_transfers where settlement_id=settlement.id),'settlementId',settlement.id,'sourceMonth',source_month,'targetMonth',target_month,'advanceAmount',p_amount,'movementId',movement_id));
  return jsonb_build_object('idempotent',false,'movementId',movement_id,'receiptDocumentId',receipt_id,'accountId',target_account.id,'sourceMonth',source_month,'targetMonth',target_month);
end;
$$;
revoke all on function public.register_staff_next_period_advance(uuid,date,numeric,date,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_staff_next_period_advance(uuid,date,numeric,date,text,text,text,text,text,text,text) to authenticated,service_role;

commit;

begin;

-- Reimbursements are cash obligations owed to Staff, but they are not
-- honoraria, role compensation or advances. Keep their payment lifecycle in
-- an immutable ledger keyed by the approved canonical expense.
create table if not exists public.staff_reimbursement_payments(
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id),
  staff_expense_submission_id uuid not null references public.staff_expense_submissions(id),
  settlement_id uuid not null references public.event_staff_payments(id),
  staff_id uuid not null references public.staff(id),
  project_id uuid not null references public.projects(id),
  amount numeric(14,2) not null check(amount>0),
  paid_on date not null,
  method text not null check(length(trim(method)) between 2 and 80),
  notes text,
  receipt_document_id uuid references public.staff_onboarding_documents(id),
  idempotency_key text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint staff_reimbursement_payments_expense_unique unique(expense_id),
  constraint staff_reimbursement_payments_idempotency_unique unique(idempotency_key)
);

create index if not exists staff_reimbursement_payments_staff_paid_idx
  on public.staff_reimbursement_payments(staff_id,paid_on desc);
create index if not exists staff_reimbursement_payments_project_idx
  on public.staff_reimbursement_payments(project_id,paid_on desc);
create index if not exists staff_reimbursement_payments_settlement_idx
  on public.staff_reimbursement_payments(settlement_id,paid_on desc);
create index if not exists staff_reimbursement_payments_submission_idx
  on public.staff_reimbursement_payments(staff_expense_submission_id);

alter table public.staff_reimbursement_payments enable row level security;
drop policy if exists staff_reimbursement_payments_admin_select on public.staff_reimbursement_payments;
create policy staff_reimbursement_payments_admin_select
  on public.staff_reimbursement_payments for select to authenticated
  using(public.can_administer());
revoke all on table public.staff_reimbursement_payments from public,anon,authenticated;
grant select on table public.staff_reimbursement_payments to authenticated;

alter table public.staff_monthly_accounts
  add column if not exists reimbursements_paid_total numeric(14,2) not null default 0 check(reimbursements_paid_total>=0),
  add column if not exists reimbursements_pending_total numeric(14,2) not null default 0 check(reimbursements_pending_total>=0);

create or replace function public.staff_settlement_payroll_amount(p_settlement_id uuid)
returns numeric language sql stable security invoker set search_path='' as $$
  select coalesce(settlement.total_internal_payment,0)
    +coalesce((select sum(adjustment.amount)
      from public.event_staff_settlement_adjustments adjustment
      where adjustment.settlement_id=settlement.id),0)
  from public.event_staff_payments settlement
  where settlement.id=p_settlement_id and settlement.deleted_at is null
$$;

create or replace function public.guard_staff_advance_balance()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  settlement public.event_staff_payments%rowtype;
  obligation numeric(14,2);
  already_paid numeric(14,2);
  available numeric(14,2);
begin
  if new.movement_type<>'ADVANCE' or new.deleted_at is not null then return new;end if;
  select * into settlement from public.event_staff_payments
  where id=new.settlement_id and status='CONFIRMED' and deleted_at is null for update;
  if not found then raise exception 'Liquidación Staff confirmada no encontrada.';end if;
  obligation:=coalesce(public.staff_settlement_payroll_amount(settlement.id),0);
  select coalesce(sum(case when movement_type='REVERSAL' then -amount else amount end),0)
  into already_paid from public.event_staff_settlement_movements
  where settlement_id=settlement.id and deleted_at is null;
  available:=greatest(obligation-already_paid,0);
  if new.amount>available then
    raise exception 'El adelanto excede el saldo disponible de honorarios ($%).',
      trim(to_char(available,'FM999G999G999G990')) using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_staff_advance_balance() from public,anon,authenticated;

create or replace function public.recalculate_event_staff_settlement(p_settlement_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare total_paid numeric(14,2);last_paid date;payroll_amount numeric(14,2);settlement_created_at timestamptz;settlement_accounting_month date;
begin
  select coalesce(sum(case when movement_type='REVERSAL' then -amount else amount end),0),
    max(movement_date) filter(where movement_type in('ADVANCE','PAYMENT'))
  into total_paid,last_paid from public.event_staff_settlement_movements
  where settlement_id=p_settlement_id and deleted_at is null;
  select created_at into settlement_created_at from public.event_staff_payments
  where id=p_settlement_id and deleted_at is null;
  if settlement_created_at is null then return;end if;
  payroll_amount:=coalesce(public.staff_settlement_payroll_amount(p_settlement_id),0);
  settlement_accounting_month:=date_trunc('month',coalesce(last_paid,timezone('America/Santiago',settlement_created_at)::date))::date;
  update public.event_staff_payments set
    paid_amount=greatest(total_paid,0),paid_at=case when total_paid>0 then last_paid else null end,
    accounting_month=settlement_accounting_month,
    settlement_status=case when total_paid<=0 then 'PENDING' when total_paid>=payroll_amount then 'PAID' else 'ADVANCE' end,
    updated_at=now(),updated_by=coalesce(auth.uid(),updated_by)
  where id=p_settlement_id;
end;
$$;

drop view if exists public.staff_monthly_payroll;
drop view if exists public.staff_worked_events;
drop view if exists public.staff_settlement_financials;

create view public.staff_settlement_financials with(security_invoker=true) as
select settlement.id settlement_id,settlement.staff_id,settlement.project_id,settlement.accounting_month,
  coalesce(settlement.operator_payment,0) original_operator,
  coalesce(settlement.assembly_payment,0) original_assembly,
  coalesce(settlement.disassembly_payment,0) original_disassembly,
  coalesce(settlement.total_internal_payment,0) original_net,
  coalesce(adjustment.total,0) adjustment_total,coalesce(reimbursement.total,0) reimbursement_total,
  coalesce(reimbursement_payment.total,0) reimbursement_paid_amount,
  greatest(coalesce(reimbursement.total,0)-coalesce(reimbursement_payment.total,0),0) reimbursement_pending_amount,
  coalesce(settlement.total_internal_payment,0)+coalesce(adjustment.total,0) payroll_net,
  coalesce(settlement.total_internal_payment,0)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0) final_amount,
  settlement.paid_amount,
  least(settlement.paid_amount,coalesce(settlement.total_internal_payment,0)+coalesce(adjustment.total,0)) payroll_paid_amount,
  greatest(coalesce(settlement.total_internal_payment,0)+coalesce(adjustment.total,0)-settlement.paid_amount,0)
    +greatest(coalesce(reimbursement.total,0)-coalesce(reimbursement_payment.total,0),0) remaining_balance,
  greatest(settlement.paid_amount-(coalesce(settlement.total_internal_payment,0)+coalesce(adjustment.total,0)),0) credit_balance,
  settlement.settlement_status,settlement.sii_receipt_status
from public.event_staff_payments settlement
left join lateral(select sum(amount) total from public.event_staff_settlement_adjustments where settlement_id=settlement.id) adjustment on true
left join lateral(select sum(total) total from public.expenses where event_staff_settlement_id=settlement.id and expense_scope='STAFF_REIMBURSEMENT' and deleted_at is null and status<>'CANCELLED') reimbursement on true
left join lateral(select sum(amount) total from public.staff_reimbursement_payments where settlement_id=settlement.id) reimbursement_payment on true
where settlement.deleted_at is null and settlement.status='CONFIRMED';

create view public.staff_worked_events with(security_invoker=true) as
select financial.settlement_id,financial.staff_id,financial.project_id,project.event_date,project.name event_name,customer.full_name customer,
  coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type) service,
  settlement.tasks roles,financial.original_net generated_net,financial.adjustment_total,financial.reimbursement_total,
  financial.reimbursement_paid_amount,financial.reimbursement_pending_amount,financial.payroll_net,financial.final_amount,
  financial.paid_amount,financial.payroll_paid_amount,financial.remaining_balance,financial.credit_balance,
  financial.settlement_status,financial.sii_receipt_status,financial.accounting_month
from public.staff_settlement_financials financial
join public.event_staff_payments settlement on settlement.id=financial.settlement_id
join public.projects project on project.id=financial.project_id
join public.customers customer on customer.id=project.customer_id;

create view public.staff_monthly_payroll with(security_invoker=true) as
select staff_id,accounting_month,count(*) events_worked,sum(generated_net) original_net,sum(adjustment_total) adjustment_total,
  sum(reimbursement_total) reimbursement_total,sum(reimbursement_paid_amount) reimbursement_paid_amount,
  sum(reimbursement_pending_amount) reimbursement_pending_amount,sum(payroll_net) payroll_net,sum(final_amount) final_amount,
  sum(paid_amount) paid_amount,sum(payroll_paid_amount) payroll_paid_amount,sum(remaining_balance) remaining_balance,
  sum(credit_balance) credit_balance,count(*) filter(where sii_receipt_status='PENDING') receipt_pending,
  count(*) filter(where sii_receipt_status='RECEIVED') receipt_received
from public.staff_worked_events group by staff_id,accounting_month;

grant select on public.staff_settlement_financials,public.staff_worked_events,public.staff_monthly_payroll to authenticated;

create or replace function public.calculate_staff_monthly_settlement(p_staff_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  month_start date:=date_trunc('month',p_month)::date;
  month_end date:=(date_trunc('month',p_month)+interval '1 month'-interval '1 day')::date;
  rate numeric:=public.staff_withholding_rate_for_period(month_start);
  work_total numeric:=0;reimbursement_total numeric:=0;reimbursement_paid numeric:=0;reimbursement_pending numeric:=0;advances numeric:=0;
  gross_amount numeric:=0;retention numeric:=0;cash_obligation numeric:=0;final_transfer numeric:=0;excess numeric:=0;
  missing_count integer:=0;ineligible_count integer:=0;event_total integer:=0;details jsonb:='[]'::jsonb;
begin
  select coalesce(sum(financial.payroll_net),0),coalesce(sum(financial.reimbursement_total),0),
    coalesce(sum(financial.reimbursement_paid_amount),0),coalesce(sum(financial.reimbursement_pending_amount),0),count(*),
    coalesce(jsonb_agg(jsonb_build_object(
      'settlementId',financial.settlement_id,'projectId',project.id,'eventDate',project.event_date,
      'event',project.name,'customer',customer.full_name,
      'service',coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type),
      'location',concat_ws(' · ',nullif(project.location,''),nullif(project.city,'')),'roles',settlement.tasks,
      'hours',coalesce((select max(service.duration_hours) from public.project_services service where service.project_id=project.id),(project.operations->>'durationHours')::numeric,0),
      'workNet',financial.payroll_net,'reimbursements',financial.reimbursement_total,
      'reimbursementsPaid',financial.reimbursement_paid_amount,'reimbursementsPending',financial.reimbursement_pending_amount,
      'advances',coalesce((select sum(case when movement.movement_type='ADVANCE' then movement.amount when movement.movement_type='REVERSAL' then -movement.amount else 0 end)
        from public.event_staff_settlement_movements movement where movement.settlement_id=settlement.id and movement.deleted_at is null),0)
    ) order by project.event_date,project.event_time,financial.settlement_id),'[]'::jsonb)
  into work_total,reimbursement_total,reimbursement_paid,reimbursement_pending,event_total,details
  from public.staff_settlement_financials financial
  join public.event_staff_payments settlement on settlement.id=financial.settlement_id
  join public.projects project on project.id=financial.project_id
  join public.customers customer on customer.id=project.customer_id
  where financial.staff_id=p_staff_id and project.event_date between month_start and month_end
    and project.deleted_at is null and upper(coalesce(project.status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED','QA')
    and settlement.deleted_at is null and settlement.status='CONFIRMED'
    and (exists(select 1 from public.event_operational_closures closure where closure.project_id=project.id and closure.status='CLOSED')
      or exists(select 1 from public.staff_monthly_close_eligibility_overrides override_record where override_record.settlement_id=settlement.id));

  select coalesce(sum(case when movement.movement_type='ADVANCE' then movement.amount when movement.movement_type='REVERSAL' then -movement.amount else 0 end),0)
  into advances from public.event_staff_settlement_movements movement
  join public.event_staff_payments settlement on settlement.id=movement.settlement_id
  join public.projects project on project.id=settlement.project_id
  where settlement.staff_id=p_staff_id and project.event_date between month_start and month_end
    and movement.deleted_at is null and settlement.deleted_at is null and settlement.status='CONFIRMED'
    and project.deleted_at is null and upper(coalesce(project.status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED','QA')
    and (exists(select 1 from public.event_operational_closures closure where closure.project_id=project.id and closure.status='CLOSED')
      or exists(select 1 from public.staff_monthly_close_eligibility_overrides override_record where override_record.settlement_id=settlement.id));
  advances:=greatest(advances,0);

  select count(*) into missing_count from(
    select distinct assignment.project_id from public.assignments assignment join public.projects project on project.id=assignment.project_id
    where assignment.staff_id=p_staff_id and assignment.deleted_at is null and assignment.status in('CONFIRMED','ACCEPTED','COMPLETED')
      and project.event_date between month_start and month_end and project.deleted_at is null
      and upper(coalesce(project.status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED','QA')
      and not exists(select 1 from public.event_staff_payments payment where payment.project_id=assignment.project_id and payment.staff_id=p_staff_id and payment.deleted_at is null and payment.status='CONFIRMED' and payment.total_internal_payment>0)
  ) missing;
  select count(*) into ineligible_count from public.event_staff_payments payment join public.projects project on project.id=payment.project_id
  where payment.staff_id=p_staff_id and payment.deleted_at is null and payment.status='CONFIRMED' and payment.total_internal_payment>0
    and project.event_date between month_start and month_end and project.deleted_at is null
    and not exists(select 1 from public.event_operational_closures closure where closure.project_id=project.id and closure.status='CLOSED')
    and not exists(select 1 from public.staff_monthly_close_eligibility_overrides override_record where override_record.settlement_id=payment.id);

  if rate is not null and work_total>0 then gross_amount:=round(work_total/(1-rate),0);end if;
  retention:=greatest(gross_amount-work_total,0);cash_obligation:=work_total;
  final_transfer:=greatest(cash_obligation-advances,0);excess:=greatest(advances-cash_obligation,0);
  return jsonb_build_object(
    'source','CANONICAL_STAFF_MONTHLY_SETTLEMENT_V2','rateSemantics','NET','periodSource','EVENT_DATE','rounding','ROUND_CLP_HALF_AWAY_FROM_ZERO',
    'staffId',p_staff_id,'month',month_start,'eventCount',event_total,'details',details,
    'workNet',work_total,'boletaGross',gross_amount,'withholdingRate',coalesce(rate,0)*100,
    'withholdingAmount',retention,'boletaNet',work_total,'reimbursementsTotal',reimbursement_total,
    'reimbursementsPaidTotal',reimbursement_paid,'reimbursementsPendingTotal',reimbursement_pending,
    'advancesTotal',advances,'cashObligation',cash_obligation,'finalTransferAmount',final_transfer,'excessAdvance',excess,
    'reviewRequired',(rate is null or missing_count>0 or ineligible_count>0 or excess>0),
    'reviewReason',concat_ws(' · ',case when rate is null then 'Falta tasa de retención efectiva para el período' end,case when missing_count>0 then missing_count||' Evento(s) con asignación sin compensación confirmada' end,case when ineligible_count>0 then ineligible_count||' Evento(s) aún no cerrados operacionalmente' end,case when excess>0 then 'Adelantos exceden la obligación mensual de honorarios' end)
  );
end;
$$;

create or replace function public.ensure_staff_monthly_account(p_staff_id uuid,p_month date)
returns public.staff_monthly_accounts language plpgsql security definer set search_path='' as $$
declare month_start date:=date_trunc('month',p_month)::date;item public.staff_monthly_accounts%rowtype;calc jsonb;inserted_count integer:=0;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and current_user not in('postgres','supabase_admin')
    and (auth.uid() is null or not public.can_administer()) then raise exception 'Acceso autorizado requerido.';end if;
  calc:=public.calculate_staff_monthly_settlement(p_staff_id,month_start);
  calc:=jsonb_set(calc,'{blockingEvents}',public.staff_monthly_blocking_events(p_staff_id,month_start),true);
  insert into public.staff_monthly_accounts(staff_id,accounting_month,expected_amount)
  values(p_staff_id,month_start,(calc->>'finalTransferAmount')::numeric) on conflict(staff_id,accounting_month) do nothing;
  get diagnostics inserted_count=row_count;
  select * into item from public.staff_monthly_accounts where staff_id=p_staff_id and accounting_month=month_start for update;
  if item.settlement_status<>'FINALIZED' and item.payment_status<>'PAID' then
    update public.staff_monthly_accounts set expected_amount=(calc->>'finalTransferAmount')::numeric,
      work_net=(calc->>'workNet')::numeric,boleta_gross=(calc->>'boletaGross')::numeric,withholding_rate=(calc->>'withholdingRate')::numeric,
      withholding_amount=(calc->>'withholdingAmount')::numeric,boleta_net=(calc->>'boletaNet')::numeric,
      advances_total=(calc->>'advancesTotal')::numeric,reimbursements_total=(calc->>'reimbursementsTotal')::numeric,
      reimbursements_paid_total=(calc->>'reimbursementsPaidTotal')::numeric,
      reimbursements_pending_total=(calc->>'reimbursementsPendingTotal')::numeric,
      final_transfer_amount=(calc->>'finalTransferAmount')::numeric,excess_advance=(calc->>'excessAdvance')::numeric,
      event_count=(calc->>'eventCount')::integer,calculation=calc,review_required=(calc->>'reviewRequired')::boolean,
      review_reason=nullif(calc->>'reviewReason',''),updated_at=now() where id=item.id returning * into item;
  else
    update public.staff_monthly_accounts set
      reimbursements_total=(calc->>'reimbursementsTotal')::numeric,
      reimbursements_paid_total=(calc->>'reimbursementsPaidTotal')::numeric,
      reimbursements_pending_total=(calc->>'reimbursementsPendingTotal')::numeric,updated_at=now()
    where id=item.id returning * into item;
  end if;
  insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state)
  values(item.id,case when inserted_count>0 then 'GENERATED' else 'REFRESHED' end,auth.uid(),calc);
  return item;
end;
$$;

create or replace function public.register_staff_reimbursement_payment(
  p_expense_id uuid,p_amount numeric,p_paid_on date,p_method text,p_notes text,p_idempotency_key text,
  p_receipt_bucket text default null,p_receipt_path text default null,p_receipt_file_name text default null,p_receipt_mime_type text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();item public.expenses%rowtype;submission public.staff_expense_submissions%rowtype;
  settlement public.event_staff_payments%rowtype;project_row public.projects%rowtype;existing public.staff_reimbursement_payments%rowtype;
  receipt_id uuid;payment_id uuid;account public.staff_monthly_accounts%rowtype;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede pagar reembolsos.';end if;
  if p_paid_on is null or nullif(trim(p_method),'') is null or nullif(trim(p_idempotency_key),'') is null then
    raise exception 'Fecha, método de pago e idempotencia son obligatorios.';
  end if;
  if (nullif(trim(p_receipt_path),'') is null)<>(nullif(trim(p_receipt_bucket),'') is null)
    or (nullif(trim(p_receipt_path),'') is null)<>(nullif(trim(p_receipt_file_name),'') is null)
    or (nullif(trim(p_receipt_path),'') is null)<>(nullif(trim(p_receipt_mime_type),'') is null) then
    raise exception 'Los metadatos del comprobante están incompletos.';
  end if;
  select * into item from public.expenses where id=p_expense_id and deleted_at is null for update;
  if not found or item.status<>'APPROVED' or item.expense_scope<>'STAFF_REIMBURSEMENT' then
    raise exception 'Solo se puede pagar un reembolso Staff aprobado.';
  end if;
  if coalesce(p_amount,0)<>item.total or item.total<=0 then raise exception 'El monto debe coincidir con el reembolso aprobado.';end if;
  if item.responsible_staff_id is null or item.event_staff_settlement_id is null then raise exception 'El reembolso no tiene una asociación Staff canónica.';end if;
  select * into submission from public.staff_expense_submissions
  where materialized_expense_id=item.id and status='APPROVED' and reimbursement=true for update;
  if not found then raise exception 'La solicitud aprobada de reembolso no está disponible.';end if;
  select * into settlement from public.event_staff_payments
  where id=item.event_staff_settlement_id and staff_id=item.responsible_staff_id and project_id=item.project_id
    and status='CONFIRMED' and deleted_at is null for update;
  if not found then raise exception 'La liquidación Staff confirmada no está disponible.';end if;
  select * into existing from public.staff_reimbursement_payments where expense_id=item.id for update;
  if found then
    if existing.idempotency_key=p_idempotency_key then
      return jsonb_build_object('idempotent',true,'paymentId',existing.id,'expenseId',item.id,'amount',existing.amount);
    end if;
    raise exception 'Este reembolso ya fue pagado.' using errcode='23505';
  end if;
  select * into project_row from public.projects where id=item.project_id and deleted_at is null;
  if not found then raise exception 'Evento no encontrado.';end if;
  if nullif(trim(p_receipt_path),'') is not null then
    insert into public.staff_onboarding_documents(
      invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,
      storage_bucket,storage_path,file_name,mime_type,created_by)
    values(null,item.responsible_staff_id,'STAFF_REIMBURSEMENT_PAYMENT_RECEIPT','PAGOS',
      to_char(project_row.event_date,'YYYY-MM'),'Comprobante de pago de reembolso Staff','ACTIVE',
      p_receipt_bucket,p_receipt_path,p_receipt_file_name,p_receipt_mime_type,actor)
    returning id into receipt_id;
  end if;
  insert into public.staff_reimbursement_payments(
    expense_id,staff_expense_submission_id,settlement_id,staff_id,project_id,amount,paid_on,method,notes,
    receipt_document_id,idempotency_key,created_by)
  values(item.id,submission.id,settlement.id,item.responsible_staff_id,item.project_id,item.total,p_paid_on,trim(p_method),
    nullif(trim(p_notes),''),receipt_id,p_idempotency_key,actor)
  returning id into payment_id;
  insert into public.timeline_events(
    project_id,customer_id,staff_id,orbit_event_id,event_type,title,description,new_state,reason,
    actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
  values(project_row.id,project_row.customer_id,item.responsible_staff_id,project_row.orbit_event_id,
    'STAFF_REIMBURSEMENT_PAID','Reembolso Staff pagado',concat(submission.category,' · $',item.total),'PAID',
    coalesce(nullif(trim(p_notes),''),'Pago de reembolso aprobado'),'Founder','Administrator',
    'STAFF_REIMBURSEMENT_PAID','StaffReimbursementPayment',payment_id,
    'Reembolso Staff pagado como movimiento separado de honorarios.','staff-reimbursement-paid:'||item.id,actor)
  on conflict(correlation_id) do nothing;
  account:=public.ensure_staff_monthly_account(item.responsible_staff_id,project_row.event_date);
  return jsonb_build_object('idempotent',false,'paymentId',payment_id,'expenseId',item.id,'amount',item.total,
    'receiptDocumentId',receipt_id,'accountId',account.id);
end;
$$;

revoke all on function public.register_staff_reimbursement_payment(uuid,numeric,date,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_staff_reimbursement_payment(uuid,numeric,date,text,text,text,text,text,text,text) to authenticated,service_role;

create or replace function public.register_staff_monthly_payment(
 p_account_id uuid,p_payment_date date,p_amount numeric,p_method text,p_reference text,p_idempotency_key text,
 p_bucket text,p_path text,p_file_name text,p_mime_type text)
returns public.staff_monthly_accounts language plpgsql security definer set search_path='' as $$
declare item public.staff_monthly_accounts%rowtype;detail jsonb;receipt_id uuid;allocated numeric:=0;remaining numeric;obligation numeric;advance numeric;source_details jsonb;actor uuid:=auth.uid();
begin
 if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede registrar pagos.';end if;
 select * into item from public.staff_monthly_accounts where id=p_account_id for update;
 if not found then raise exception 'Cuenta mensual no encontrada.';end if;
 if item.payment_status='PAID' then if item.payment_idempotency_key=p_idempotency_key then return item;end if;raise exception 'La cuenta mensual ya está pagada.';end if;
 if item.review_required or item.excess_advance>0 then raise exception 'La liquidación requiere revisión Founder.';end if;
 if item.boleta_status<>'APPROVED' or item.payment_status<>'READY_TO_PAY' then raise exception 'La boleta debe estar aprobada y la cuenta lista para pagar.';end if;
 if coalesce(p_amount,0)<>item.final_transfer_amount or item.final_transfer_amount<=0 then raise exception 'El pago debe coincidir con el saldo final mensual de honorarios.';end if;
 if p_bucket is null or p_path is null or p_file_name is null or p_mime_type is null then raise exception 'El comprobante de pago es obligatorio.';end if;
 insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
 values(null,item.staff_id,'STAFF_PAYMENT_RECEIPT','PAGOS',to_char(item.accounting_month,'YYYY-MM'),'Comprobante de pago Staff','ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,actor) returning id into receipt_id;
 source_details:=coalesce(item.finalized_snapshot->'details',item.calculation->'details','[]'::jsonb);
 for detail in select value from jsonb_array_elements(source_details) loop
   obligation:=coalesce((detail->>'workNet')::numeric,0);advance:=greatest(coalesce((detail->>'advances')::numeric,0),0);
   remaining:=least(greatest(obligation-advance,0),p_amount-allocated);
   if remaining>0 then
     insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,receipt_path,notes,legacy_source,created_by,updated_by)
     values((detail->>'settlementId')::uuid,'PAYMENT',remaining,coalesce(p_payment_date,current_date),nullif(trim(p_method),''),p_path,
       nullif(trim(p_reference),''),'staff-monthly:'||item.id||':'||(detail->>'settlementId'),actor,actor)
     on conflict(legacy_source) do nothing;allocated:=allocated+remaining;
   end if;
   exit when allocated>=p_amount;
 end loop;
 if allocated<>p_amount then raise exception 'La distribución del pago de honorarios no coincide con el saldo mensual.';end if;
 update public.staff_monthly_accounts set payment_status='PAID',paid_amount=p_amount,paid_at=coalesce(p_payment_date,current_date),
   payment_method=nullif(trim(p_method),''),payment_reference=nullif(trim(p_reference),''),payment_receipt_document_id=receipt_id,
   payment_idempotency_key=p_idempotency_key,drive_sync_status='PENDING',updated_at=now() where id=item.id returning * into item;
 insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state) values(item.id,'PAYMENT_RECORDED',actor,to_jsonb(item));
 return item;
end;
$$;
revoke all on function public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) to authenticated,service_role;

do $$declare item record;begin
  for item in select id from public.event_staff_payments where deleted_at is null loop
    perform public.recalculate_event_staff_settlement(item.id);
  end loop;
end$$;

do $$declare item record;begin
  for item in select staff_id,accounting_month from public.staff_monthly_accounts loop
    perform public.ensure_staff_monthly_account(item.staff_id,item.accounting_month);
  end loop;
end$$;

commit;

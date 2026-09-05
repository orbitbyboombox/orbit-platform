begin;

-- Canonical, effective-dated SII withholding source. Existing ORBIT rates are
-- NET compensation; this configuration is used to gross-up the monthly boleta.
create table if not exists public.staff_withholding_rates(
  id uuid primary key default gen_random_uuid(),
  effective_from date not null,
  effective_to date,
  rate_percent numeric(7,4) not null check(rate_percent>=0 and rate_percent<100),
  source text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check(effective_to is null or effective_to>=effective_from),
  unique(effective_from)
);
create unique index if not exists staff_withholding_rates_open_ended_idx
  on public.staff_withholding_rates((effective_to is null)) where effective_to is null;
alter table public.staff_withholding_rates enable row level security;
drop policy if exists staff_withholding_rates_admin_read on public.staff_withholding_rates;
create policy staff_withholding_rates_admin_read on public.staff_withholding_rates for select using(public.can_administer());
drop policy if exists staff_withholding_rates_admin_write on public.staff_withholding_rates;
create policy staff_withholding_rates_admin_write on public.staff_withholding_rates for all using(public.can_administer()) with check(public.can_administer());
revoke all on public.staff_withholding_rates from public,anon,authenticated;
grant select,insert,update on public.staff_withholding_rates to authenticated;

insert into public.staff_withholding_rates(effective_from,effective_to,rate_percent,source)
values('2026-01-01','2026-12-31',15.25,'SII 2026 · migrado desde STAFF_WITHHOLDING_RATE')
on conflict(effective_from) do nothing;

alter table public.staff_monthly_accounts
  add column if not exists work_net numeric(14,2) not null default 0 check(work_net>=0),
  add column if not exists boleta_gross numeric(14,2) not null default 0 check(boleta_gross>=0),
  add column if not exists withholding_rate numeric(7,4) not null default 0 check(withholding_rate>=0 and withholding_rate<100),
  add column if not exists withholding_amount numeric(14,2) not null default 0 check(withholding_amount>=0),
  add column if not exists boleta_net numeric(14,2) not null default 0 check(boleta_net>=0),
  add column if not exists advances_total numeric(14,2) not null default 0 check(advances_total>=0),
  add column if not exists reimbursements_total numeric(14,2) not null default 0 check(reimbursements_total>=0),
  add column if not exists final_transfer_amount numeric(14,2) not null default 0 check(final_transfer_amount>=0),
  add column if not exists excess_advance numeric(14,2) not null default 0 check(excess_advance>=0),
  add column if not exists event_count integer not null default 0 check(event_count>=0),
  add column if not exists calculation jsonb not null default '{}'::jsonb,
  add column if not exists settlement_status text not null default 'DRAFT' check(settlement_status in('DRAFT','FINALIZED')),
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references auth.users(id),
  add column if not exists finalized_snapshot jsonb,
  add column if not exists settlement_document_id uuid references public.staff_onboarding_documents(id),
  add column if not exists review_required boolean not null default false,
  add column if not exists review_reason text;

alter table public.staff_monthly_accounts drop constraint if exists staff_monthly_accounts_check;
alter table public.staff_monthly_accounts drop constraint if exists staff_monthly_accounts_payment_state_check;
alter table public.staff_monthly_accounts add constraint staff_monthly_accounts_payment_state_check check(
  (payment_status<>'PAID') or
  (paid_at is not null and (paid_amount=0 or payment_receipt_document_id is not null))
);

create table if not exists public.staff_monthly_settlement_audit(
  id bigint generated always as identity primary key,
  account_id uuid not null references public.staff_monthly_accounts(id),
  action text not null check(action in('GENERATED','REFRESHED','FINALIZED','BOLETA_UPLOADED','BOLETA_REJECTED','BOLETA_APPROVED','PAYMENT_RECORDED')),
  actor_id uuid references auth.users(id),
  reason text,
  state jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists staff_monthly_settlement_audit_account_idx on public.staff_monthly_settlement_audit(account_id,occurred_at desc);
alter table public.staff_monthly_settlement_audit enable row level security;
drop policy if exists staff_monthly_settlement_audit_admin_read on public.staff_monthly_settlement_audit;
create policy staff_monthly_settlement_audit_admin_read on public.staff_monthly_settlement_audit for select using(public.can_administer());
revoke all on public.staff_monthly_settlement_audit from public,anon,authenticated;
grant select on public.staff_monthly_settlement_audit to authenticated;

create or replace function public.staff_withholding_rate_for_period(p_month date)
returns numeric language sql stable security definer set search_path=public as $$
  select rate_percent/100 from public.staff_withholding_rates
  where date_trunc('month',p_month)::date between effective_from and coalesce(effective_to,'infinity'::date)
  order by effective_from desc limit 1
$$;

create or replace function public.staff_monthly_blocking_events(p_staff_id uuid,p_month date)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'settlementId',payment.id,'projectId',project.id,'eventId',project.orbit_event_id,
    'eventDate',project.event_date,'event',project.name,
    'service',coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type),
    'status',coalesce(project.status,'OPEN')) order by project.event_date,project.event_time,payment.id),'[]'::jsonb)
  from public.event_staff_payments payment join public.projects project on project.id=payment.project_id
  where payment.staff_id=p_staff_id and payment.status='CONFIRMED' and payment.deleted_at is null
    and project.event_date>=date_trunc('month',p_month)::date and project.event_date<(date_trunc('month',p_month)+interval '1 month')::date
    and project.deleted_at is null and upper(coalesce(project.status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED','QA')
    and not exists(select 1 from public.event_operational_closures closure where closure.project_id=project.id and closure.status='CLOSED')
    and not exists(select 1 from public.staff_monthly_close_eligibility_overrides override_record where override_record.settlement_id=payment.id)
$$;

create or replace function public.calculate_staff_monthly_settlement(p_staff_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  month_start date:=date_trunc('month',p_month)::date;
  month_end date:=(date_trunc('month',p_month)+interval '1 month'-interval '1 day')::date;
  rate numeric:=public.staff_withholding_rate_for_period(month_start);
  work_total numeric:=0; reimbursement_total numeric:=0; advances numeric:=0;
  gross_amount numeric:=0; retention numeric:=0; cash_obligation numeric:=0;
  final_transfer numeric:=0; excess numeric:=0; missing_count integer:=0; ineligible_count integer:=0; event_total integer:=0;
  details jsonb:='[]'::jsonb;
begin
  select coalesce(sum(financial.payroll_net),0),coalesce(sum(financial.reimbursement_total),0),count(*),
    coalesce(jsonb_agg(jsonb_build_object(
      'settlementId',financial.settlement_id,'projectId',project.id,'eventDate',project.event_date,
      'event',project.name,'customer',customer.full_name,
      'service',coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type),
      'location',concat_ws(' · ',nullif(project.location,''),nullif(project.city,'')),
      'roles',settlement.tasks,
      'hours',coalesce((select max(service.duration_hours) from public.project_services service where service.project_id=project.id),(project.operations->>'durationHours')::numeric,0),
      'workNet',financial.payroll_net,'reimbursements',financial.reimbursement_total,
      'advances',coalesce((select sum(case when movement.movement_type='ADVANCE' then movement.amount when movement.movement_type='REVERSAL' then -movement.amount else 0 end)
        from public.event_staff_settlement_movements movement where movement.settlement_id=settlement.id and movement.deleted_at is null),0)
    ) order by project.event_date,project.event_time,financial.settlement_id),'[]'::jsonb)
  into work_total,reimbursement_total,event_total,details
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
  into advances
  from public.event_staff_settlement_movements movement
  join public.event_staff_payments settlement on settlement.id=movement.settlement_id
  join public.projects project on project.id=settlement.project_id
  where settlement.staff_id=p_staff_id and project.event_date between month_start and month_end
    and movement.deleted_at is null and settlement.deleted_at is null and settlement.status='CONFIRMED'
    and project.deleted_at is null and upper(coalesce(project.status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED','QA')
    and (exists(select 1 from public.event_operational_closures closure where closure.project_id=project.id and closure.status='CLOSED')
      or exists(select 1 from public.staff_monthly_close_eligibility_overrides override_record where override_record.settlement_id=settlement.id));
  advances:=greatest(advances,0);

  select count(*) into missing_count from (
    select distinct assignment.project_id
    from public.assignments assignment join public.projects project on project.id=assignment.project_id
    where assignment.staff_id=p_staff_id and assignment.deleted_at is null
      and assignment.status in('CONFIRMED','ACCEPTED','COMPLETED')
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
  retention:=greatest(gross_amount-work_total,0);
  cash_obligation:=work_total+reimbursement_total;
  final_transfer:=greatest(cash_obligation-advances,0);
  excess:=greatest(advances-cash_obligation,0);
  return jsonb_build_object(
    'source','CANONICAL_STAFF_MONTHLY_SETTLEMENT_V1','rateSemantics','NET','periodSource','EVENT_DATE','rounding','ROUND_CLP_HALF_AWAY_FROM_ZERO',
    'staffId',p_staff_id,'month',month_start,'eventCount',event_total,'details',details,
    'workNet',work_total,'boletaGross',gross_amount,'withholdingRate',coalesce(rate,0)*100,
    'withholdingAmount',retention,'boletaNet',work_total,'reimbursementsTotal',reimbursement_total,
    'advancesTotal',advances,'cashObligation',cash_obligation,'finalTransferAmount',final_transfer,'excessAdvance',excess,
    'reviewRequired',(rate is null or missing_count>0 or ineligible_count>0 or excess>0),
    'reviewReason',concat_ws(' · ',case when rate is null then 'Falta tasa de retención efectiva para el período' end,case when missing_count>0 then missing_count||' Evento(s) con asignación sin compensación confirmada' end,case when ineligible_count>0 then ineligible_count||' Evento(s) aún no cerrados operacionalmente' end,case when excess>0 then 'Adelantos exceden la obligación mensual' end)
  );
end $$;

create or replace function public.ensure_staff_monthly_account(p_staff_id uuid,p_month date)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare month_start date:=date_trunc('month',p_month)::date; item public.staff_monthly_accounts%rowtype; calc jsonb; inserted_count integer:=0;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' and (auth.uid() is null or not public.can_administer()) then raise exception 'Acceso autorizado requerido.';end if;
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
      final_transfer_amount=(calc->>'finalTransferAmount')::numeric,excess_advance=(calc->>'excessAdvance')::numeric,
      event_count=(calc->>'eventCount')::integer,calculation=calc,review_required=(calc->>'reviewRequired')::boolean,
      review_reason=nullif(calc->>'reviewReason',''),updated_at=now() where id=item.id returning * into item;
    insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state)
    values(item.id,case when inserted_count>0 then 'GENERATED' else 'REFRESHED' end,auth.uid(),calc);
  end if;
  return item;
end $$;

create or replace function public.generate_staff_monthly_accounts(p_month date)
returns integer language plpgsql security definer set search_path=public as $$
declare month_start date:=date_trunc('month',p_month)::date; member record; generated integer:=0;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede generar liquidaciones.';end if;
  for member in
    select distinct candidate.staff_id from (
      select payment.staff_id from public.event_staff_payments payment join public.projects project on project.id=payment.project_id
      where payment.deleted_at is null and payment.status='CONFIRMED' and project.event_date>=month_start and project.event_date<(month_start+interval '1 month')::date and project.deleted_at is null
      union
      select assignment.staff_id from public.assignments assignment join public.projects project on project.id=assignment.project_id
      where assignment.deleted_at is null and assignment.status in('CONFIRMED','ACCEPTED','COMPLETED') and project.event_date>=month_start and project.event_date<(month_start+interval '1 month')::date and project.deleted_at is null
    ) candidate
  loop
    perform public.ensure_staff_monthly_account(member.staff_id,month_start);
    generated:=generated+1;
  end loop;
  return generated;
end $$;

create or replace function public.submit_staff_monthly_boleta(
  p_staff_id uuid,p_month date,p_bucket text,p_path text,p_file_name text,p_mime_type text,p_actor uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare account public.staff_monthly_accounts%rowtype; document_id uuid;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Backend autorizado requerido.';end if;
  account:=public.ensure_staff_monthly_account(p_staff_id,p_month);
  if account.settlement_status<>'FINALIZED' then raise exception 'La liquidación aún no ha sido finalizada por BOOMBOX.';end if;
  if account.payment_status='PAID' then raise exception 'La cuenta mensual ya está pagada.';end if;
  if account.boleta_status<>'REJECTED' and account.boleta_document_id is not null then raise exception 'La boleta vigente ya fue enviada.';end if;
  insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
  values(null,p_staff_id,'BOLETA_HONORARIOS','BOLETAS',date_trunc('month',p_month)::date,'Boleta de honorarios','ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,p_actor)
  returning id into document_id;
  if account.boleta_document_id is not null then update public.staff_onboarding_documents set status='REPLACED',updated_at=now() where id=account.boleta_document_id;end if;
  update public.staff_monthly_accounts set boleta_status='RECEIVED',boleta_document_id=document_id,boleta_rejection_reason=null,boleta_reviewed_at=null,boleta_reviewed_by=null,payment_status='PENDING',drive_sync_status='PENDING',updated_at=now() where id=account.id;
  insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state) values(account.id,'BOLETA_UPLOADED',p_actor,jsonb_build_object('documentId',document_id));
  return document_id;
end $$;

create or replace function public.register_staff_settlement_movement(p_settlement_id uuid,p_type text,p_amount numeric,p_date date,p_method text,p_notes text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; work_month date;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede registrar pagos de Staff.';end if;
  if p_type not in('ADVANCE','PAYMENT','REVERSAL') or coalesce(p_amount,0)<=0 then raise exception 'Movimiento de liquidación inválido.';end if;
  select date_trunc('month',project.event_date)::date into work_month from public.event_staff_payments payment join public.projects project on project.id=payment.project_id where payment.id=p_settlement_id and payment.deleted_at is null and payment.status='CONFIRMED';
  if work_month is null then raise exception 'Liquidación confirmada no encontrada.';end if;
  if exists(select 1 from public.staff_monthly_accounts account join public.event_staff_payments payment on payment.staff_id=account.staff_id where payment.id=p_settlement_id and account.accounting_month=work_month and account.settlement_status='FINALIZED') then raise exception 'La liquidación mensual está finalizada y no admite nuevos movimientos.';end if;
  insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,notes,created_by,updated_by)
  values(p_settlement_id,p_type,p_amount,coalesce(p_date,current_date),nullif(trim(p_method),''),nullif(trim(p_notes),''),auth.uid(),auth.uid()) returning id into result;
  return result;
end $$;

create or replace function public.finalize_staff_monthly_account(p_account_id uuid)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare item public.staff_monthly_accounts%rowtype;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede finalizar.';end if;
  select * into item from public.staff_monthly_accounts where id=p_account_id for update;
  if not found then raise exception 'Liquidación mensual no encontrada.';end if;
  item:=public.ensure_staff_monthly_account(item.staff_id,item.accounting_month);
  if item.review_required then raise exception 'La liquidación requiere revisión Founder antes de finalizar: %',item.review_reason;end if;
  if item.work_net<=0 then raise exception 'No existe trabajo mensual elegible para finalizar.';end if;
  update public.staff_monthly_accounts set settlement_status='FINALIZED',finalized_at=now(),finalized_by=auth.uid(),finalized_snapshot=calculation,updated_at=now() where id=item.id returning * into item;
  insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state) values(item.id,'FINALIZED',auth.uid(),item.finalized_snapshot);
  return item;
end $$;

create or replace function public.review_staff_monthly_boleta(p_account_id uuid,p_action text,p_reason text default null)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare item public.staff_monthly_accounts%rowtype; actor uuid:=auth.uid();
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede revisar boletas.';end if;
  if p_action not in('APPROVE','REJECT') then raise exception 'Acción inválida.';end if;
  if p_action='REJECT' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Motivo de rechazo obligatorio.';end if;
  select * into item from public.staff_monthly_accounts where id=p_account_id for update;
  if not found or item.boleta_status<>'RECEIVED' then raise exception 'Boleta no disponible para revisión.';end if;
  if item.settlement_status<>'FINALIZED' then raise exception 'Finaliza la liquidación antes de revisar la boleta.';end if;
  if item.review_required then raise exception 'La liquidación requiere revisión Founder.';end if;
  update public.staff_monthly_accounts set boleta_status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,
    boleta_rejection_reason=case when p_action='REJECT' then trim(p_reason) else null end,boleta_reviewed_at=now(),boleta_reviewed_by=actor,
    payment_status=case when p_action='APPROVE' and final_transfer_amount=0 then 'PAID' when p_action='APPROVE' then 'READY_TO_PAY' else 'PENDING' end,
    paid_amount=case when p_action='APPROVE' and final_transfer_amount=0 then 0 else paid_amount end,
    paid_at=case when p_action='APPROVE' and final_transfer_amount=0 then current_date else paid_at end,updated_at=now() where id=item.id returning * into item;
  insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
  values(item.id,case when p_action='APPROVE' then 'BOLETA_APPROVED' else 'BOLETA_REJECTED' end,actor,nullif(trim(p_reason),''),to_jsonb(item));
  return item;
end $$;

create or replace function public.register_staff_monthly_payment(
  p_account_id uuid,p_payment_date date,p_amount numeric,p_method text,p_reference text,p_idempotency_key text,
  p_bucket text,p_path text,p_file_name text,p_mime_type text)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare item public.staff_monthly_accounts%rowtype; detail jsonb; receipt_id uuid; allocated numeric:=0; remaining numeric; event_obligation numeric; event_advance numeric; actor uuid:=auth.uid();
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede registrar pagos.';end if;
  select * into item from public.staff_monthly_accounts where id=p_account_id for update;
  if not found then raise exception 'Cuenta mensual no encontrada.';end if;
  if item.payment_status='PAID' then
    if item.payment_idempotency_key=p_idempotency_key then return item;end if;
    raise exception 'La cuenta mensual ya está pagada.';
  end if;
  if item.settlement_status<>'FINALIZED' then raise exception 'Finaliza la liquidación antes de pagar.';end if;
  if item.review_required or item.excess_advance>0 then raise exception 'La liquidación requiere revisión Founder.';end if;
  if item.boleta_status<>'APPROVED' then raise exception 'Aprueba la boleta antes de pagar.';end if;
  if coalesce(p_amount,0)<>item.final_transfer_amount or item.final_transfer_amount<=0 then raise exception 'El pago debe coincidir con el saldo final mensual.';end if;
  insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
  values(null,item.staff_id,'STAFF_PAYMENT_RECEIPT','PAGOS',item.accounting_month,'Comprobante de pago Staff','ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,actor) returning id into receipt_id;
  for detail in select value from jsonb_array_elements(item.finalized_snapshot->'details')
  loop
    event_obligation:=(detail->>'workNet')::numeric+(detail->>'reimbursements')::numeric;
    event_advance:=greatest(coalesce((detail->>'advances')::numeric,0),0);
    remaining:=greatest(event_obligation-event_advance,0);
    remaining:=least(remaining,p_amount-allocated);
    if remaining>0 then
      insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,receipt_path,notes,legacy_source,created_by,updated_by)
      values((detail->>'settlementId')::uuid,'PAYMENT',remaining,coalesce(p_payment_date,current_date),nullif(trim(p_method),''),p_path,nullif(trim(p_reference),''),'staff-monthly:'||item.id||':'||(detail->>'settlementId'),actor,actor)
      on conflict(legacy_source) do nothing;
      allocated:=allocated+remaining;
    end if;
    exit when allocated>=p_amount;
  end loop;
  if allocated<>p_amount then raise exception 'La distribución del pago no coincide con el saldo mensual.';end if;
  update public.staff_monthly_accounts set payment_status='PAID',paid_amount=p_amount,paid_at=coalesce(p_payment_date,current_date),payment_method=nullif(trim(p_method),''),payment_reference=nullif(trim(p_reference),''),payment_receipt_document_id=receipt_id,payment_idempotency_key=p_idempotency_key,drive_sync_status='PENDING',updated_at=now() where id=item.id returning * into item;
  insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state) values(item.id,'PAYMENT_RECORDED',actor,to_jsonb(item));
  return item;
end $$;

-- The work period is always the canonical Event date; payment dates remain on movements.
create or replace view public.staff_monthly_payroll with(security_invoker=true) as
select financial.staff_id,date_trunc('month',project.event_date)::date accounting_month,count(*) events_worked,
  sum(financial.original_net) original_net,sum(financial.adjustment_total) adjustment_total,sum(financial.reimbursement_total) reimbursement_total,
  sum(financial.payroll_net) payroll_net,sum(financial.final_amount) final_amount,sum(financial.paid_amount) paid_amount,
  sum(financial.remaining_balance) remaining_balance,sum(financial.credit_balance) credit_balance,
  count(*) filter(where financial.sii_receipt_status='PENDING') receipt_pending,count(*) filter(where financial.sii_receipt_status='RECEIVED') receipt_received
from public.staff_settlement_financials financial join public.projects project on project.id=financial.project_id
where project.deleted_at is null and upper(coalesce(project.status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED','QA')
group by financial.staff_id,date_trunc('month',project.event_date)::date;

create or replace view public.staff_monthly_payment_sheet with(security_invoker=true) as
select account.id,account.staff_id,account.accounting_month,staff.first_name,staff.last_name,
  account.final_transfer_amount total_to_deposit,account.boleta_status,account.payment_status,
  case when account.boleta_status='APPROVED' and account.payment_status='READY_TO_PAY' then account.final_transfer_amount else 0 end payable_total
from public.staff_monthly_accounts account join public.staff staff on staff.id=account.staff_id
where staff.deleted_at is null;
grant select on public.staff_monthly_payment_sheet to authenticated;

revoke all on function public.staff_withholding_rate_for_period(date),public.calculate_staff_monthly_settlement(uuid,date),public.generate_staff_monthly_accounts(date),public.finalize_staff_monthly_account(uuid) from public,anon,authenticated;
grant execute on function public.generate_staff_monthly_accounts(date),public.finalize_staff_monthly_account(uuid) to authenticated;

-- No August backfill is executed here. Accounts are generated from real data by explicit Founder action.
commit;

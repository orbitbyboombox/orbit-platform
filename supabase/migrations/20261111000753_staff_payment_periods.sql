begin;

-- Opt-in only. Existing accounts, snapshots, movements and documents are untouched.
create table public.staff_payment_schedules (
  account_id uuid primary key references public.staff_monthly_accounts(id),
  modality text not null check (modality in ('QUINCENAL','MENSUAL')),
  monthly_boleta_validation text,
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (modality <> 'QUINCENAL' or (monthly_boleta_validation is not null and length(trim(monthly_boleta_validation)) >= 10))
);
create table public.staff_payment_periods (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.staff_payment_schedules(account_id),
  period_code text not null check (period_code in ('Q1','Q2','MONTH')),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  status text not null default 'DRAFT' check (status in ('DRAFT','FINALIZED')),
  snapshot jsonb,
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  unique (account_id, period_code),
  check ((status='DRAFT' and snapshot is null) or (status='FINALIZED' and snapshot is not null))
);
create table public.staff_period_payments (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.staff_payment_periods(id),
  amount numeric(14,0) not null check (amount>0),
  paid_on date not null,
  tax_period date not null,
  gross_amount numeric(14,0) not null,
  withholding_rate numeric(7,4) not null check(withholding_rate>=0 and withholding_rate<100),
  withholding_amount numeric(14,0) not null check(withholding_amount>=0),
  check(gross_amount=amount+withholding_amount),
  method text not null check (length(trim(method))>0),
  reference text not null,
  receipt_document_id uuid not null references public.staff_onboarding_documents(id),
  idempotency_key text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index staff_period_payments_period_idx on public.staff_period_payments(period_id);
-- Training has no event_staff_payments FK. Its movements are linked to the same payment batch.
create table public.staff_training_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.staff_period_payments(id),
  training_id uuid not null references public.staff_training_assignments(id),
  amount numeric(14,0) not null check(amount>0),
  unique(payment_id,training_id)
);
create index staff_training_payment_allocations_training_idx on public.staff_training_payment_allocations(training_id);
create table public.staff_payment_period_audit (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.staff_monthly_accounts(id),
  period_id uuid references public.staff_payment_periods(id),
  action text not null check(action in ('MODALITY_APPLIED','PERIOD_CLOSED','PAYMENT_RECORDED')),
  actor_id uuid not null references auth.users(id),
  state jsonb not null,
  occurred_at timestamptz not null default now()
);
create index staff_payment_period_audit_account_idx on public.staff_payment_period_audit(account_id,occurred_at);

alter table public.staff_payment_schedules enable row level security;
alter table public.staff_payment_periods enable row level security;
alter table public.staff_period_payments enable row level security;
alter table public.staff_training_payment_allocations enable row level security;
alter table public.staff_payment_period_audit enable row level security;
create policy staff_payment_schedules_read on public.staff_payment_schedules for select to authenticated using ((select public.can_administer()));
create policy staff_payment_periods_read on public.staff_payment_periods for select to authenticated using ((select public.can_administer()));
create policy staff_period_payments_read on public.staff_period_payments for select to authenticated using ((select public.can_administer()));
create policy staff_training_payment_allocations_read on public.staff_training_payment_allocations for select to authenticated using ((select public.can_administer()));
create policy staff_payment_period_audit_read on public.staff_payment_period_audit for select to authenticated using ((select public.can_administer()));
revoke all on public.staff_payment_schedules,public.staff_payment_periods,public.staff_period_payments,public.staff_training_payment_allocations,public.staff_payment_period_audit from public,anon,authenticated;
grant select on public.staff_payment_schedules,public.staff_payment_periods,public.staff_period_payments,public.staff_training_payment_allocations,public.staff_payment_period_audit to authenticated;
grant all on public.staff_payment_schedules,public.staff_payment_periods,public.staff_period_payments,public.staff_training_payment_allocations,public.staff_payment_period_audit to service_role;

create function public.configure_staff_payment_periods(p_staff_ids uuid[],p_month date,p_modality text,p_tax_validation text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare staff_id uuid; account public.staff_monthly_accounts; schedule public.staff_payment_schedules;
  month_start date:=date_trunc('month',p_month)::date; affected integer:=0;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  if p_month is null or p_modality is null or p_modality not in ('QUINCENAL','MENSUAL') or coalesce(cardinality(p_staff_ids),0)=0 then raise exception 'Selecciona trabajadores, mes y modalidad.'; end if;
  if p_modality='QUINCENAL' and length(trim(coalesce(p_tax_validation,'')))<10 then
    raise exception 'La boleta mensual de pagos quincenales requiere validación tributaria documentada.';
  end if;
  -- Stable order makes overlapping bulk selections serialize without deadlocks.
  for staff_id in select distinct unnest(p_staff_ids) order by 1 loop
    if not exists(select 1 from public.staff s where s.id=staff_id and s.deleted_at is null) then raise exception 'Trabajador no disponible: %',staff_id; end if;
    account:=public.ensure_staff_monthly_account(staff_id,month_start);
    select * into account from public.staff_monthly_accounts where id=account.id for update;
    if account.settlement_status='FINALIZED' or account.payment_status='PAID' or account.boleta_document_id is not null then raise exception 'El período de % está cerrado, pagado o tiene boleta vinculada.',staff_id; end if;
    if exists(select 1 from public.staff_monthly_closes where accounting_month=month_start and status in ('CLOSED','PAID')) then raise exception 'El mes está cerrado.'; end if;
    select * into schedule from public.staff_payment_schedules where account_id=account.id;
    if schedule.modality=p_modality then continue; end if;
    if exists(select 1 from public.staff_payment_periods where account_id=account.id and status='FINALIZED') then raise exception 'No se puede cambiar la modalidad de un período cerrado.'; end if;
    delete from public.staff_payment_periods where account_id=account.id;
    insert into public.staff_payment_schedules(account_id,modality,monthly_boleta_validation,validated_by,validated_at,created_by)
    values(account.id,p_modality,nullif(trim(p_tax_validation),''),case when p_modality='QUINCENAL' then auth.uid() end,case when p_modality='QUINCENAL' then now() end,auth.uid())
    on conflict(account_id) do update set modality=excluded.modality,monthly_boleta_validation=excluded.monthly_boleta_validation,validated_by=excluded.validated_by,validated_at=excluded.validated_at;
    if p_modality='QUINCENAL' then
      insert into public.staff_payment_periods(account_id,period_code,starts_on,ends_on) values
        (account.id,'Q1',month_start,month_start+13),
        (account.id,'Q2',month_start+14,(month_start+interval '1 month'-interval '1 day')::date);
    else
      insert into public.staff_payment_periods(account_id,period_code,starts_on,ends_on)
      values(account.id,'MONTH',month_start,(month_start+interval '1 month'-interval '1 day')::date);
    end if;
    insert into public.staff_payment_period_audit(account_id,action,actor_id,state)
    values(account.id,'MODALITY_APPLIED',auth.uid(),jsonb_build_object('modality',p_modality,'taxValidation',p_tax_validation));
    affected:=affected+1;
  end loop;
  return affected;
end $$;

-- Preserve the existing calculation, including training, and reconcile its payments.
create or replace function public.calculate_staff_monthly_settlement(
  p_staff_id uuid,
  p_month date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  month_start date := date_trunc('month', p_month)::date;
  account_status text;
  payment_status text;
  training_total numeric := 0;
  training_paid numeric := 0;
  paid_for_training numeric := 0;
  period_enabled boolean;
  training_count integer := 0;
  training_details jsonb := '[]'::jsonb;
  training record;
begin
  result := public.calculate_staff_monthly_settlement_legacy(p_staff_id, month_start);

  select coalesce(a.settlement_status, ''), coalesce(a.payment_status, '')
    into account_status, payment_status
  from public.staff_monthly_accounts a
  where a.staff_id = p_staff_id and a.accounting_month = month_start;

  -- A completed training recorded after a closed/paid month must be reviewed
  -- separately; it must never rewrite historical payroll.
  select exists(select 1 from public.staff_payment_schedules s join public.staff_monthly_accounts a on a.id=s.account_id where a.staff_id=p_staff_id and a.accounting_month=month_start) into period_enabled;
  if not period_enabled and (account_status in ('FINALIZED', 'CLOSED', 'PAID') or payment_status = 'PAID') then
    return result;
  end if;

  for training in
    select
      t.id,
      t.project_id,
      t.training_amount_clp,
      p.event_date,
      p.name as event_name,
      p.location,
      p.city,
      coalesce(c.full_name, '') as customer_name
    from public.staff_training_assignments t
    join public.projects p on p.id = t.project_id and p.deleted_at is null
    left join public.customers c on c.id = p.customer_id
    where t.trainee_staff_id = p_staff_id
      and t.status = 'COMPLETED'
      and p.event_date >= month_start
      and p.event_date < (month_start + interval '1 month')::date
    order by p.event_date, t.id
  loop
    select coalesce(sum(amount),0) into paid_for_training from public.staff_training_payment_allocations where training_id=training.id;
    training_paid := training_paid + paid_for_training;
    training_count := training_count + 1;
    training_total := training_total + coalesce(training.training_amount_clp, 0);
    training_details := training_details || jsonb_build_array(jsonb_build_object(
      'settlementId', training.id,
      'projectId', training.project_id,
      'eventDate', training.event_date,
      'event', training.event_name,
      'customer', training.customer_name,
      'service', 'CAPACITACIÓN',
      'location', concat_ws(' · ', nullif(training.location, ''), nullif(training.city, '')),
      'roles', jsonb_build_array('OPERADOR EN CAPACITACIÓN'),
      'hours', 0,
      'workNet', coalesce(training.training_amount_clp, 0),
      'baseWorkNet', coalesce(training.training_amount_clp, 0),
      'adjustmentTotal', 0,
      'workPaid', paid_for_training,
      'workPending', greatest(coalesce(training.training_amount_clp, 0)-paid_for_training,0),
      'workOverpayment', 0,
      'paidAmountField', 0,
      'advances', 0,
      'payments', paid_for_training,
      'reimbursements', 0,
      'reimbursementsPaid', 0,
      'reimbursementsPending', 0,
      'reimbursementOverpayment', 0,
      'settlementStatus', 'PENDING',
      'trainingAssignmentId', training.id
    ));
  end loop;

  if training_count = 0 then
    return result;
  end if;

  result := jsonb_set(result, '{workNet}', to_jsonb((result->>'workNet')::numeric + training_total), true);
  result := jsonb_set(result, '{boletaNet}', to_jsonb((result->>'boletaNet')::numeric + training_total), true);
  result := jsonb_set(result, '{boletaGross}', to_jsonb(round((result->>'boletaNet')::numeric / greatest(1 - ((result->>'withholdingRate')::numeric / 100), 0.0001), 0)), true);
  result := jsonb_set(result, '{withholdingAmount}', to_jsonb(greatest((result->>'boletaGross')::numeric - (result->>'boletaNet')::numeric, 0)), true);
  result := jsonb_set(result, '{workPending}', to_jsonb((result->>'workPending')::numeric + training_total-training_paid), true);
  result := jsonb_set(result, '{cashObligation}', to_jsonb((result->>'cashObligation')::numeric + training_total-training_paid), true);
  result := jsonb_set(result, '{finalTransferAmount}', to_jsonb((result->>'finalTransferAmount')::numeric + training_total-training_paid), true);
  result := jsonb_set(result, '{eventCount}', to_jsonb((result->>'eventCount')::integer + training_count), true);
  result := jsonb_set(result, '{details}', coalesce(result->'details', '[]'::jsonb) || training_details, true);
  result := jsonb_set(result, '{workPaid}', to_jsonb(coalesce((result->>'workPaid')::numeric,0)+training_paid), true);
  result := jsonb_set(result, '{trainingCount}', to_jsonb(training_count), true);
  result := jsonb_set(result, '{trainingTotal}', to_jsonb(training_total), true);
  return result;
end;
$$;

-- Internal projection only. All amounts originate in the canonical monthly calculation.
create function public.staff_payment_period_calculation(p_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare period public.staff_payment_periods; account public.staff_monthly_accounts; calc jsonb; details jsonb;
  work numeric; paid numeric; advances numeric; reimbursements numeric; reimbursements_paid numeric; rate numeric; gross numeric; pending_count integer;
begin
  select * into period from public.staff_payment_periods where id=p_period_id;
  if not found then raise exception 'Período no encontrado.'; end if;
  select * into account from public.staff_monthly_accounts where id=period.account_id;
  calc:=public.calculate_staff_monthly_settlement(account.staff_id,account.accounting_month);
  select coalesce(jsonb_agg(d order by d->>'eventDate',d->>'settlementId'),'[]'::jsonb),
    coalesce(sum((d->>'workNet')::numeric),0),coalesce(sum((d->>'workPaid')::numeric),0),
    coalesce(sum((d->>'advances')::numeric),0),coalesce(sum((d->>'reimbursements')::numeric),0),coalesce(sum((d->>'reimbursementsPaid')::numeric),0)
  into details,work,paid,advances,reimbursements,reimbursements_paid
  from jsonb_array_elements(calc->'details') d where (d->>'eventDate')::date between period.starts_on and period.ends_on;
  select count(*) into pending_count from jsonb_array_elements(coalesce(calc->'upcomingDetails','[]')) d
    where (d->>'eventDate')::date between period.starts_on and period.ends_on;
  rate:=(calc->>'withholdingRate')::numeric/100;
  gross:=round(work/nullif(1-rate,0),0);
  return calc || jsonb_build_object('periodId',period.id,'periodCode',period.period_code,'startsOn',period.starts_on,'endsOn',period.ends_on,
    'details',details,'eventCount',jsonb_array_length(details),'workNet',work,'workPaid',paid,'workPending',greatest(work-paid,0),
    'advancesTotal',advances,'boletaGross',gross,'boletaNet',work,'withholdingAmount',gross-work,
    'reimbursementsTotal',reimbursements,'reimbursementsPaidTotal',reimbursements_paid,'reimbursementsPendingTotal',greatest(reimbursements-reimbursements_paid,0),
    'finalTransferAmount',greatest(work-paid,0),'reviewRequired',coalesce((calc->>'reviewRequired')::boolean,true) or pending_count>0,
    'reviewReason',concat_ws(' · ',nullif(calc->>'reviewReason',''),case when pending_count>0 then 'Hay servicios pendientes en este bloque' end));
end $$;

create function public.preview_staff_payment_period(p_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare period public.staff_payment_periods; calc jsonb; paid numeric;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  select * into period from public.staff_payment_periods where id=p_period_id;
  if not found then raise exception 'Período no encontrado.'; end if;
  calc:=case when period.status='FINALIZED' then period.snapshot else public.staff_payment_period_calculation(period.id) end;
  select coalesce(sum(amount),0) into paid from public.staff_period_payments where period_id=period.id;
  return to_jsonb(period)||jsonb_build_object('calculation',calc,'paidAmount',paid,
    'remaining',greatest((calc->>'workPending')::numeric-paid,0));
end $$;

-- Freeze only explicitly configured new accounts; legacy callers keep their behavior.
alter function public.finalize_staff_monthly_account(uuid) rename to finalize_staff_monthly_account_before_periods;
create function public.finalize_staff_monthly_account(p_account_id uuid)
returns public.staff_monthly_accounts language plpgsql security definer set search_path='' as $$
declare account public.staff_monthly_accounts;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  select * into account from public.staff_monthly_accounts where id=p_account_id for update;
  if not found then raise exception 'Cuenta mensual no encontrada.'; end if;
  if account.settlement_status='FINALIZED' or account.payment_status='PAID' then return account; end if;
  if exists(select 1 from public.staff_payment_periods where account_id=account.id and status<>'FINALIZED') then
    raise exception 'Cierra todos los bloques antes de consolidar y solicitar la boleta mensual.';
  end if;
  return public.finalize_staff_monthly_account_before_periods(account.id);
end $$;

create function public.close_staff_payment_period(p_period_id uuid)
returns public.staff_payment_periods language plpgsql security definer set search_path='' as $$
declare period public.staff_payment_periods; account public.staff_monthly_accounts; calc jsonb; previous_period public.staff_payment_periods;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  -- Same account-first lock order for configure, close and payment.
  select a.* into account from public.staff_monthly_accounts a join public.staff_payment_periods p on p.account_id=a.id where p.id=p_period_id for update of a;
  select * into period from public.staff_payment_periods where id=p_period_id for update;
  if not found then raise exception 'Período no encontrado.'; end if;
  if period.status='FINALIZED' then return period; end if;
  if account.settlement_status='FINALIZED' or account.payment_status='PAID' then raise exception 'Cuenta mensual protegida.'; end if;
  if (now() at time zone 'America/Santiago')::date<period.ends_on then raise exception 'El bloque aún no termina.'; end if;
  if period.period_code='Q2' and exists(select 1 from public.staff_payment_periods where account_id=account.id and period_code='Q1' and status<>'FINALIZED') then raise exception 'Cierra primero la primera quincena.'; end if;
  perform 1 from public.event_staff_payments where staff_id=account.staff_id and accounting_month=account.accounting_month order by id for update;
  perform 1 from public.staff_training_assignments t join public.projects p on p.id=t.project_id where t.trainee_staff_id=account.staff_id and p.event_date between period.starts_on and period.ends_on order by t.id for update of t;
  for previous_period in select * from public.staff_payment_periods where account_id=account.id and status='FINALIZED' loop
    calc:=public.staff_payment_period_calculation(previous_period.id);
    if (select jsonb_agg(jsonb_build_array(d->'settlementId',d->'eventDate',d->'workNet',d->'roles',d->'reimbursements') order by d->>'settlementId') from jsonb_array_elements(calc->'details') d)
      is distinct from (select jsonb_agg(jsonb_build_array(d->'settlementId',d->'eventDate',d->'workNet',d->'roles',d->'reimbursements') order by d->>'settlementId') from jsonb_array_elements(previous_period.snapshot->'details') d) then raise exception 'Un bloque cerrado cambió. Requiere conciliación antes de consolidar.'; end if;
  end loop;
  calc:=public.staff_payment_period_calculation(period.id);
  if (calc->>'reviewRequired')::boolean then raise exception 'Revisión requerida: %',calc->>'reviewReason'; end if;
  update public.staff_payment_periods set status='FINALIZED',snapshot=calc,closed_by=auth.uid(),closed_at=now() where id=period.id returning * into period;
  insert into public.staff_payment_period_audit(account_id,period_id,action,actor_id,state) values(account.id,period.id,'PERIOD_CLOSED',auth.uid(),calc);
  if period.period_code in ('Q2','MONTH') then perform public.finalize_staff_monthly_account(account.id); end if;
  return period;
end $$;

create function public.register_staff_period_payment(p_period_id uuid,p_amount numeric,p_paid_on date,p_method text,p_reference text,p_idempotency_key text,
  p_bucket text,p_path text,p_file_name text,p_mime_type text)
returns public.staff_period_payments language plpgsql security definer set search_path='' as $$
declare period public.staff_payment_periods; account public.staff_monthly_accounts; payment public.staff_period_payments;
  receipt_id uuid; calc jsonb; monthly_calc jsonb; detail jsonb; paid numeric; allocate numeric; allocated numeric:=0; pending numeric; gross numeric; rate numeric; work_paid numeric;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  if coalesce(p_amount,0)<=0 or p_amount<>round(p_amount,0) or p_paid_on is null or nullif(trim(p_method),'') is null or nullif(trim(p_idempotency_key),'') is null
    or p_bucket is distinct from 'orbit-documents' or nullif(trim(p_path),'') is null or nullif(trim(p_file_name),'') is null
    or p_mime_type is null or p_mime_type not in ('application/pdf','image/png','image/jpeg','image/webp') then raise exception 'Monto CLP, fecha, método y comprobante son obligatorios.'; end if;
  select a.* into account from public.staff_monthly_accounts a join public.staff_payment_periods p on p.account_id=a.id where p.id=p_period_id for update of a;
  select * into period from public.staff_payment_periods where id=p_period_id for update;
  if not found then raise exception 'Período no encontrado.'; end if;
  select * into payment from public.staff_period_payments where idempotency_key=p_idempotency_key;
  if found then
    if payment.period_id<>period.id or payment.amount<>p_amount or payment.paid_on<>p_paid_on or payment.method<>p_method or payment.reference<>coalesce(p_reference,'') then raise exception 'La clave de pago ya pertenece a otro movimiento.'; end if;
    return payment;
  end if;
  if period.status<>'FINALIZED' or account.payment_status='PAID' then raise exception 'El bloque debe estar cerrado y pendiente de pago.'; end if;
  if p_paid_on>(now() at time zone 'America/Santiago')::date then raise exception 'La fecha de pago no puede ser futura.'; end if;
  if exists(select 1 from public.staff_payment_schedules where account_id=account.id and modality='QUINCENAL')
    and date_trunc('month',p_paid_on)::date<>account.accounting_month then raise exception 'El pago cae en otro período tributario y requiere revisión contable.'; end if;
  if exists(select 1 from public.staff_period_payments b join public.staff_payment_periods p on p.id=b.period_id
    where p.account_id=account.id and b.tax_period<>date_trunc('month',p_paid_on)::date) then raise exception 'Los pagos abarcan períodos tributarios diferentes. Requiere revisión contable.'; end if;
  if period.period_code='Q1' then
    if not exists(select 1 from public.staff_payment_schedules where account_id=account.id and validated_by is not null and length(trim(monthly_boleta_validation))>=10) then raise exception 'Falta validación tributaria para boleta mensual.'; end if;
  elsif account.boleta_status<>'APPROVED' then raise exception 'Aprueba la boleta mensual antes de registrar este pago.';
  end if;
  if public.staff_withholding_rate_for_period(p_paid_on) is distinct from (period.snapshot->>'withholdingRate')::numeric/100 then raise exception 'La tasa del período de pago cambió. Requiere conciliación tributaria.'; end if;
  select coalesce(sum(amount),0) into paid from public.staff_period_payments where period_id=period.id;
  if p_amount>greatest((period.snapshot->>'workPending')::numeric-paid,0) then raise exception 'El monto supera el saldo del bloque.'; end if;
  perform 1 from public.event_staff_payments where staff_id=account.staff_id and accounting_month=account.accounting_month order by id for update;
  perform 1 from public.staff_training_assignments t join public.projects p on p.id=t.project_id where t.trainee_staff_id=account.staff_id and p.event_date between period.starts_on and period.ends_on order by t.id for update of t;
  calc:=public.staff_payment_period_calculation(period.id);
  if (calc->>'reviewRequired')::boolean or p_amount>(calc->>'workPending')::numeric then raise exception 'El saldo cambió o requiere conciliación.'; end if;
  -- Any changed cost or event set after closing requires explicit reconciliation.
  if (select jsonb_agg(jsonb_build_array(d->'settlementId',d->'eventDate',d->'workNet',d->'roles',d->'reimbursements') order by d->>'settlementId') from jsonb_array_elements(calc->'details') d)
    is distinct from (select jsonb_agg(jsonb_build_array(d->'settlementId',d->'eventDate',d->'workNet',d->'roles',d->'reimbursements') order by d->>'settlementId') from jsonb_array_elements(period.snapshot->'details') d) then raise exception 'Los servicios cambiaron después del cierre. Requiere conciliación.'; end if;
  insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
  values(null,account.staff_id,'STAFF_PAYMENT_RECEIPT','PAGOS',to_char(account.accounting_month,'YYYY-MM'),'Comprobante Staff · '||period.period_code,'ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,auth.uid()) returning id into receipt_id;
  monthly_calc:=public.calculate_staff_monthly_settlement(account.staff_id,account.accounting_month);
  rate:=public.staff_withholding_rate_for_period(p_paid_on);
  work_paid:=coalesce((monthly_calc->>'workPaid')::numeric,0);
  -- Cumulative CLP rounding reconciles partial payments to one monthly boleta.
  gross:=round((work_paid+p_amount)/(1-rate),0)-round(work_paid/(1-rate),0);
  insert into public.staff_period_payments(period_id,amount,paid_on,tax_period,gross_amount,withholding_rate,withholding_amount,method,reference,receipt_document_id,idempotency_key,created_by)
  values(period.id,p_amount,p_paid_on,date_trunc('month',p_paid_on)::date,gross,rate*100,gross-p_amount,trim(p_method),coalesce(p_reference,''),receipt_id,p_idempotency_key,auth.uid()) returning * into payment;
  perform set_config('orbit.staff_period_payment',period.id::text,true);
  for detail in select value from jsonb_array_elements(calc->'details') loop
    pending:=greatest((detail->>'workPending')::numeric,0);
    allocate:=least(pending,p_amount-allocated);
    if allocate>0 then
      if detail ? 'trainingAssignmentId' then
        insert into public.staff_training_payment_allocations(payment_id,training_id,amount) values(payment.id,(detail->>'trainingAssignmentId')::uuid,allocate);
      else
        insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,receipt_path,receipt_document_id,notes,legacy_source,created_by,updated_by)
        values((detail->>'settlementId')::uuid,'PAYMENT',allocate,p_paid_on,trim(p_method),p_path,receipt_id,p_reference,'staff-period:'||payment.id||':'||(detail->>'settlementId'),auth.uid(),auth.uid());
      end if;
      allocated:=allocated+allocate;
    end if;
    exit when allocated>=p_amount;
  end loop;
  if allocated<>p_amount then raise exception 'La distribución del pago no coincide con el saldo.'; end if;
  perform set_config('orbit.staff_period_payment','',true);
  insert into public.staff_payment_period_audit(account_id,period_id,action,actor_id,state) values(account.id,period.id,'PAYMENT_RECORDED',auth.uid(),to_jsonb(payment));
  -- Refresh only open monthly projections. FINALIZED snapshots remain historical.
  if account.settlement_status<>'FINALIZED' then perform public.ensure_staff_monthly_account(account.staff_id,account.accounting_month); end if;
  if account.settlement_status='FINALIZED' then
    monthly_calc:=public.calculate_staff_monthly_settlement(account.staff_id,account.accounting_month);
    update public.staff_monthly_accounts set
      paid_amount=greatest(coalesce((monthly_calc->>'workPaid')::numeric,0)-coalesce((account.finalized_snapshot->>'workPaid')::numeric,0),0),
      paid_at=p_paid_on,payment_method=trim(p_method),payment_reference=p_reference,
      payment_receipt_document_id=receipt_id,payment_idempotency_key=p_idempotency_key,drive_sync_status='PENDING',updated_at=now()
    where id=account.id;
  end if;
  if account.boleta_status='APPROVED' and not exists(
    select 1 from public.staff_payment_periods p where p.account_id=account.id and
      (p.status<>'FINALIZED' or coalesce((p.snapshot->>'workPending')::numeric,0)>(select coalesce(sum(b.amount),0) from public.staff_period_payments b where b.period_id=p.id))
  ) then
    update public.staff_monthly_accounts set payment_status='PAID',
      paid_at=p_paid_on,payment_method=trim(p_method),payment_reference=p_reference,
      payment_receipt_document_id=receipt_id,payment_idempotency_key=p_idempotency_key,drive_sync_status='PENDING',updated_at=now()
    where id=account.id;
  end if;
  return payment;
end $$;
-- Other entry points cannot pay the same configured account through the old monthly batch.
alter function public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) rename to register_staff_monthly_payment_before_periods;
create function public.register_staff_monthly_payment(p_account_id uuid,p_payment_date date,p_amount numeric,p_method text,p_reference text,p_idempotency_key text,p_bucket text,p_path text,p_file_name text,p_mime_type text)
returns public.staff_monthly_accounts language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  perform 1 from public.staff_monthly_accounts where id=p_account_id for update;
  if exists(select 1 from public.staff_payment_schedules where account_id=p_account_id) then raise exception 'Registra el pago desde el bloque quincenal o mensual seleccionado.'; end if;
  return public.register_staff_monthly_payment_before_periods(p_account_id,p_payment_date,p_amount,p_method,p_reference,p_idempotency_key,p_bucket,p_path,p_file_name,p_mime_type);
end $$;

-- Protect financial inputs and independent movements once a new block closes.
create function public.guard_staff_payment_period_inputs()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_id uuid; frozen_period uuid; before_row jsonb:=to_jsonb(old); after_row jsonb:=to_jsonb(new);
begin
  if tg_table_name='staff_training_assignments' then
    target_id:=coalesce(after_row->>'id',before_row->>'id')::uuid;
    select p.id into frozen_period from public.staff_payment_periods p
    where p.status='FINALIZED' and exists(select 1 from jsonb_array_elements(p.snapshot->'details') d where d->>'trainingAssignmentId'=target_id::text) limit 1;
  else
    target_id:=case when tg_table_name='event_staff_payments' then coalesce(after_row->>'id',before_row->>'id')::uuid else coalesce(before_row->>'settlement_id',after_row->>'settlement_id')::uuid end;
    select p.id into frozen_period from public.staff_payment_periods p
    where p.status='FINALIZED' and exists(select 1 from jsonb_array_elements(p.snapshot->'details') d where d->>'settlementId'=target_id::text) limit 1;
  end if;
  if frozen_period is not null then
    if tg_table_name='event_staff_settlement_movements' and tg_op='INSERT'
      and after_row->>'movement_type'='PAYMENT' and current_setting('orbit.staff_period_payment',true)=frozen_period::text then return new; end if;
    if tg_table_name='event_staff_payments' and tg_op='UPDATE'
      and (before_row-array['paid_amount','paid_at','settlement_status','updated_at','updated_by'])=(after_row-array['paid_amount','paid_at','settlement_status','updated_at','updated_by']) then return new; end if;
    raise exception 'El bloque Staff está cerrado y sus conceptos o movimientos están protegidos.';
  end if;
  return coalesce(new,old);
end $$;
create trigger staff_period_guard_settlement before update or delete on public.event_staff_payments for each row execute function public.guard_staff_payment_period_inputs();
create trigger staff_period_guard_movements before insert or update or delete on public.event_staff_settlement_movements for each row execute function public.guard_staff_payment_period_inputs();
create trigger staff_period_guard_adjustments before insert or update or delete on public.event_staff_settlement_adjustments for each row execute function public.guard_staff_payment_period_inputs();
create trigger staff_period_guard_training before update or delete on public.staff_training_assignments for each row execute function public.guard_staff_payment_period_inputs();

revoke all on function public.configure_staff_payment_periods(uuid[],date,text,text),public.staff_payment_period_calculation(uuid),public.preview_staff_payment_period(uuid),public.close_staff_payment_period(uuid),public.register_staff_period_payment(uuid,numeric,date,text,text,text,text,text,text,text),public.guard_staff_payment_period_inputs(),public.finalize_staff_monthly_account_before_periods(uuid),public.register_staff_monthly_payment_before_periods(uuid,date,numeric,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.finalize_staff_monthly_account(uuid),public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.configure_staff_payment_periods(uuid[],date,text,text),public.preview_staff_payment_period(uuid),public.close_staff_payment_period(uuid),public.register_staff_period_payment(uuid,numeric,date,text,text,text,text,text,text,text),public.finalize_staff_monthly_account(uuid),public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.staff_payment_period_calculation(uuid) to service_role;

create view public.staff_training_payment_movements with(security_invoker=true) as
select allocation.id,training.project_id,training.trainee_staff_id staff_id,allocation.amount,
  payment.paid_on movement_date,payment.method,payment.receipt_document_id,payment.id payment_id
from public.staff_training_payment_allocations allocation
join public.staff_training_assignments training on training.id=allocation.training_id
join public.staff_period_payments payment on payment.id=allocation.payment_id;
create view public.staff_training_period_balances with(security_invoker=true) as
select training.id,training.project_id,training.trainee_staff_id staff_id,project.event_date,
  training.training_amount_clp work_net,coalesce(sum(allocation.amount),0) paid_amount,
  greatest(training.training_amount_clp-coalesce(sum(allocation.amount),0),0) remaining_balance
from public.staff_training_assignments training
join public.projects project on project.id=training.project_id
left join public.staff_training_payment_allocations allocation on allocation.training_id=training.id
where training.status='COMPLETED' and project.deleted_at is null
  and upper(coalesce(project.status,'')) not in ('CANCELLED','CANCELED','ARCHIVED','DELETED','QA')
group by training.id,project.event_date;
grant select on public.staff_training_payment_movements,public.staff_training_period_balances to authenticated,service_role;

commit;

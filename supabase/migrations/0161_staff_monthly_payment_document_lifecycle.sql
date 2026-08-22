begin;

alter table public.staff_onboarding_documents
  drop constraint if exists staff_onboarding_documents_category_check;
alter table public.staff_onboarding_documents
  add constraint staff_onboarding_documents_category_check
  check(category in('IDENTIDAD','CONTRATOS','BOLETAS','GASTOS','LIQUIDACIONES','PAGOS','OTROS'));
alter table public.staff_onboarding_documents
  add column if not exists drive_file_id text,
  add column if not exists drive_folder_id text,
  add column if not exists drive_sync_status text not null default 'PENDING'
    check(drive_sync_status in('PENDING','SYNCED','ERROR')),
  add column if not exists drive_sync_error text,
  add column if not exists drive_synced_at timestamptz;

create table if not exists public.staff_monthly_accounts(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  accounting_month date not null,
  expected_amount numeric(14,2) not null default 0 check(expected_amount>=0),
  boleta_status text not null default 'PENDING' check(boleta_status in('PENDING','RECEIVED','APPROVED','REJECTED')),
  boleta_document_id uuid references public.staff_onboarding_documents(id),
  boleta_rejection_reason text,
  boleta_reviewed_at timestamptz,
  boleta_reviewed_by uuid references auth.users(id),
  payment_status text not null default 'PENDING' check(payment_status in('PENDING','READY_TO_PAY','PAID')),
  paid_amount numeric(14,2) not null default 0 check(paid_amount>=0),
  paid_at date,
  payment_method text,
  payment_reference text,
  payment_receipt_document_id uuid references public.staff_onboarding_documents(id),
  payment_idempotency_key text unique,
  drive_sync_status text not null default 'PENDING' check(drive_sync_status in('PENDING','SYNCED','ERROR')),
  drive_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(staff_id,accounting_month),
  check(date_trunc('month',accounting_month)::date=accounting_month),
  check((payment_status='PAID')=(paid_at is not null and payment_receipt_document_id is not null))
);
create index if not exists staff_monthly_accounts_staff_month_idx on public.staff_monthly_accounts(staff_id,accounting_month desc);
alter table public.staff_monthly_accounts enable row level security;
create policy staff_monthly_accounts_admin_read on public.staff_monthly_accounts for select using(public.can_administer());
revoke all on public.staff_monthly_accounts from public,anon,authenticated;
grant select on public.staff_monthly_accounts to authenticated;

create or replace function public.staff_monthly_expected_amount(p_staff_id uuid,p_month date)
returns numeric language sql stable security definer set search_path=public as $$
  select coalesce(sum(final_amount),0) from public.staff_settlement_financials
  where staff_id=p_staff_id and accounting_month=date_trunc('month',p_month)::date
$$;

create or replace function public.ensure_staff_monthly_account(p_staff_id uuid,p_month date)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare month_start date:=date_trunc('month',p_month)::date; item public.staff_monthly_accounts%rowtype; amount numeric;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' and (auth.uid() is null or not public.can_administer()) then raise exception 'Acceso autorizado requerido.';end if;
  amount:=public.staff_monthly_expected_amount(p_staff_id,month_start);
  insert into public.staff_monthly_accounts(staff_id,accounting_month,expected_amount)
  values(p_staff_id,month_start,amount) on conflict(staff_id,accounting_month) do nothing;
  select * into item from public.staff_monthly_accounts where staff_id=p_staff_id and accounting_month=month_start for update;
  if item.payment_status<>'PAID' then
    update public.staff_monthly_accounts set expected_amount=amount,updated_at=now() where id=item.id returning * into item;
  end if;
  return item;
end $$;

create or replace function public.submit_staff_monthly_boleta(
  p_staff_id uuid,p_month date,p_bucket text,p_path text,p_file_name text,p_mime_type text,p_actor uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare account public.staff_monthly_accounts%rowtype; document_id uuid;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Backend autorizado requerido.';end if;
  account:=public.ensure_staff_monthly_account(p_staff_id,p_month);
  if account.payment_status='PAID' then raise exception 'La cuenta mensual ya está pagada.';end if;
  if account.boleta_status<>'REJECTED' and account.boleta_document_id is not null then raise exception 'La boleta vigente ya fue enviada.';end if;
  insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
  values(null,p_staff_id,'BOLETA_HONORARIOS','BOLETAS',date_trunc('month',p_month)::date,'Boleta de honorarios','ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,p_actor)
  returning id into document_id;
  if account.boleta_document_id is not null then update public.staff_onboarding_documents set status='REPLACED',updated_at=now() where id=account.boleta_document_id;end if;
  update public.staff_monthly_accounts set boleta_status='RECEIVED',boleta_document_id=document_id,boleta_rejection_reason=null,boleta_reviewed_at=null,boleta_reviewed_by=null,payment_status='PENDING',drive_sync_status='PENDING',updated_at=now() where id=account.id;
  return document_id;
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
  update public.staff_monthly_accounts set boleta_status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,
    boleta_rejection_reason=case when p_action='REJECT' then trim(p_reason) else null end,boleta_reviewed_at=now(),boleta_reviewed_by=actor,
    payment_status=case when p_action='APPROVE' then 'READY_TO_PAY' else 'PENDING' end,updated_at=now() where id=item.id returning * into item;
  return item;
end $$;

create or replace function public.register_staff_monthly_payment(
  p_account_id uuid,p_payment_date date,p_amount numeric,p_method text,p_reference text,p_idempotency_key text,
  p_bucket text,p_path text,p_file_name text,p_mime_type text)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare item public.staff_monthly_accounts%rowtype; settlement record; receipt_id uuid; remaining numeric; actor uuid:=auth.uid();
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede registrar pagos.';end if;
  select * into item from public.staff_monthly_accounts where id=p_account_id for update;
  if not found then raise exception 'Cuenta mensual no encontrada.';end if;
  if item.payment_status='PAID' then
    if item.payment_idempotency_key=p_idempotency_key then return item;end if;
    raise exception 'La cuenta mensual ya está pagada.';
  end if;
  if item.boleta_status<>'APPROVED' then raise exception 'Aprueba la boleta antes de pagar.';end if;
  if coalesce(p_amount,0)<>item.expected_amount or item.expected_amount<=0 then raise exception 'El pago debe coincidir con el total mensual congelado.';end if;
  insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
  values(null,item.staff_id,'STAFF_PAYMENT_RECEIPT','PAGOS',item.accounting_month,'Comprobante de pago Staff','ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,actor)
  returning id into receipt_id;
  for settlement in select settlement_id,remaining_balance from public.staff_settlement_financials where staff_id=item.staff_id and accounting_month=item.accounting_month and remaining_balance>0 order by settlement_id loop
    remaining:=least(settlement.remaining_balance,p_amount-coalesce((select sum(amount) from public.event_staff_settlement_movements where legacy_source like 'staff-monthly:'||item.id||':%'),0));
    if remaining>0 then
      insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,receipt_path,notes,legacy_source,created_by,updated_by)
      values(settlement.settlement_id,'PAYMENT',remaining,coalesce(p_payment_date,current_date),nullif(trim(p_method),''),p_path,nullif(trim(p_reference),''),'staff-monthly:'||item.id||':'||settlement.settlement_id,actor,actor)
      on conflict(legacy_source) do nothing;
    end if;
  end loop;
  update public.staff_monthly_accounts set payment_status='PAID',paid_amount=p_amount,paid_at=coalesce(p_payment_date,current_date),payment_method=nullif(trim(p_method),''),payment_reference=nullif(trim(p_reference),''),payment_receipt_document_id=receipt_id,payment_idempotency_key=p_idempotency_key,drive_sync_status='PENDING',updated_at=now() where id=item.id returning * into item;
  perform public.refresh_staff_month_payment_state(item.accounting_month);
  return item;
end $$;

revoke all on function public.staff_monthly_expected_amount(uuid,date),public.ensure_staff_monthly_account(uuid,date),public.submit_staff_monthly_boleta(uuid,date,text,text,text,text,uuid),public.review_staff_monthly_boleta(uuid,text,text),public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.review_staff_monthly_boleta(uuid,text,text),public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) to authenticated;

-- Idempotent lifecycle projection only. No payments, documents or Drive writes.
insert into public.staff_monthly_accounts(staff_id,accounting_month,expected_amount)
select staff_id,accounting_month,sum(final_amount) from public.staff_settlement_financials group by staff_id,accounting_month
on conflict(staff_id,accounting_month) do update set expected_amount=case when staff_monthly_accounts.payment_status='PAID' then staff_monthly_accounts.expected_amount else excluded.expected_amount end,updated_at=now();

commit;

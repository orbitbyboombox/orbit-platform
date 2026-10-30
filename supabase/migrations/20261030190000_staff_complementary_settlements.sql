-- Independent complementary Staff settlement. It never reopens or updates a
-- monthly account and never creates an event payment movement.
begin;

create table if not exists public.staff_complementary_settlements (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  settlement_id uuid not null references public.event_staff_payments(id),
  original_month date not null,
  event_date date not null,
  net_amount numeric(12,2) not null check (net_amount > 0),
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'PENDING' check (status in ('PENDING','BOLETA_RECEIVED','BOLETA_REJECTED','READY_TO_PAY','PAID','CANCELLED')),
  boleta_document_id uuid references public.staff_onboarding_documents(id),
  boleta_issue_date date,
  boleta_received_at timestamptz,
  boleta_reviewed_at timestamptz,
  boleta_reviewed_by uuid references auth.users(id),
  boleta_rejection_reason text,
  payment_receipt_document_id uuid references public.staff_onboarding_documents(id),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  paid_at date,
  payment_method text,
  payment_reference text,
  payment_idempotency_key text unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complementary_payment_integrity check (
    (status = 'PAID' and paid_amount = net_amount and paid_at is not null
      and nullif(trim(payment_method), '') is not null
      and payment_receipt_document_id is not null and boleta_document_id is not null)
    or (status <> 'PAID' and paid_amount = 0 and paid_at is null
      and payment_receipt_document_id is null)
  ),
  constraint complementary_boleta_integrity check (
    (status in ('BOLETA_RECEIVED','READY_TO_PAY','PAID')
      and boleta_document_id is not null and boleta_issue_date is not null)
    or status in ('PENDING','BOLETA_REJECTED','CANCELLED')
  )
);

create unique index if not exists staff_complementary_one_active_per_event
  on public.staff_complementary_settlements(settlement_id)
  where status <> 'CANCELLED';
create index if not exists staff_complementary_by_staff
  on public.staff_complementary_settlements(staff_id, event_date desc);

alter table public.staff_complementary_settlements enable row level security;
revoke all on public.staff_complementary_settlements from anon, authenticated;
grant select on public.staff_complementary_settlements to authenticated;
drop policy if exists staff_complementary_admin_read on public.staff_complementary_settlements;
create policy staff_complementary_admin_read on public.staff_complementary_settlements
  for select to authenticated using (public.can_administer());

create or replace function public.create_staff_complementary_settlement(
  p_settlement_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_event public.event_staff_payments%rowtype;
  v_account public.staff_monthly_accounts%rowtype;
  v_date date;
  v_net numeric;
  v_id uuid;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso denegado'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Motivo obligatorio'; end if;
  select * into v_event from public.event_staff_payments
   where id=p_settlement_id and status='CONFIRMED' and deleted_at is null for update;
  if not found then raise exception 'Liquidación de evento no confirmada'; end if;
  select p.event_date into v_date from public.projects p
   where p.id=v_event.project_id and p.deleted_at is null;
  if v_date is null then raise exception 'Evento sin fecha'; end if;
  select * into v_account from public.staff_monthly_accounts
   where staff_id=v_event.staff_id
     and accounting_month=date_trunc('month',v_event.accounting_month)::date for update;
  if not found or v_account.settlement_status<>'FINALIZED' then raise exception 'El mes original no está cerrado'; end if;
  if jsonb_typeof(v_account.finalized_snapshot->'details')<>'array' then raise exception 'Falta snapshot verificable'; end if;
  if exists(select 1 from jsonb_array_elements(v_account.finalized_snapshot->'details') d where d->>'settlementId'=v_event.id::text) then
    raise exception 'Evento ya incluido en cierre original';
  end if;
  if exists(select 1 from public.event_staff_settlement_movements m
    where m.settlement_id=v_event.id and m.deleted_at is null and m.movement_type in ('ADVANCE','PAYMENT')) then
    raise exception 'Evento con pagos previos requiere conciliación';
  end if;
  -- Scalar aggregates prevent the former aggregate error and preserve a base-only amount.
  select coalesce(v_event.total_internal_payment,0)
       + coalesce((select sum(a.amount) from public.event_staff_settlement_adjustments a where a.settlement_id=v_event.id),0)
    into v_net;
  if v_net<=0 then raise exception 'Monto inválido'; end if;
  insert into public.staff_complementary_settlements
    (staff_id,settlement_id,original_month,event_date,net_amount,reason,created_by)
  values(v_event.staff_id,v_event.id,date_trunc('month',v_event.accounting_month)::date,v_date,v_net,trim(p_reason),auth.uid())
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe una liquidación complementaria activa para este evento';
end;
$$;

create or replace function public.submit_staff_complementary_boleta(
  p_settlement_id uuid,p_bucket text,p_path text,p_file_name text,p_mime_type text,p_issue_date date
) returns public.staff_complementary_settlements
language plpgsql security definer set search_path=public as $$
declare item public.staff_complementary_settlements%rowtype; document_id uuid;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso denegado'; end if;
  if p_bucket <> 'orbit-documents' then raise exception 'Bucket no permitido'; end if;
  if p_issue_date is null or nullif(trim(p_path),'') is null then raise exception 'Boleta incompleta'; end if;
  select * into item from public.staff_complementary_settlements where id=p_settlement_id for update;
  if not found or item.status not in ('PENDING','BOLETA_REJECTED') then raise exception 'La liquidación no acepta una nueva boleta'; end if;
  insert into public.staff_onboarding_documents
    (invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
  values(null,item.staff_id,'BOLETA_HONORARIOS','BOLETAS',to_char(item.event_date,'YYYY-MM'),'Boleta complementaria de honorarios','ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,auth.uid())
  returning id into document_id;
  update public.staff_complementary_settlements set status='BOLETA_RECEIVED',boleta_document_id=document_id,boleta_issue_date=p_issue_date,boleta_received_at=now(),boleta_reviewed_at=null,boleta_reviewed_by=null,boleta_rejection_reason=null,updated_at=now()
   where id=item.id returning * into item;
  return item;
end;
$$;

create or replace function public.review_staff_complementary_boleta(
  p_settlement_id uuid,p_action text,p_reason text default null
) returns public.staff_complementary_settlements
language plpgsql security definer set search_path=public as $$
declare item public.staff_complementary_settlements%rowtype;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso denegado'; end if;
  if p_action not in ('APPROVE','REJECT') then raise exception 'Acción inválida'; end if;
  if p_action='REJECT' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Motivo obligatorio'; end if;
  select * into item from public.staff_complementary_settlements where id=p_settlement_id for update;
  if not found or item.status<>'BOLETA_RECEIVED' then raise exception 'Boleta no disponible para revisión'; end if;
  update public.staff_complementary_settlements set status=case when p_action='APPROVE' then 'READY_TO_PAY' else 'BOLETA_REJECTED' end,boleta_reviewed_at=now(),boleta_reviewed_by=auth.uid(),boleta_rejection_reason=case when p_action='REJECT' then trim(p_reason) else null end,updated_at=now()
   where id=item.id returning * into item;
  return item;
end;
$$;

create or replace function public.register_staff_complementary_payment(
  p_settlement_id uuid,p_payment_date date,p_amount numeric,p_method text,p_reference text,p_idempotency_key text,
  p_bucket text,p_path text,p_file_name text,p_mime_type text
) returns public.staff_complementary_settlements
language plpgsql security definer set search_path=public as $$
declare item public.staff_complementary_settlements%rowtype; receipt_id uuid;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso denegado'; end if;
  if p_bucket <> 'orbit-documents' then raise exception 'Bucket no permitido'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Idempotencia obligatoria'; end if;
  select * into item from public.staff_complementary_settlements where id=p_settlement_id for update;
  if not found then raise exception 'Liquidación complementaria no encontrada'; end if;
  if item.status='PAID' and item.payment_idempotency_key=p_idempotency_key then return item; end if;
  if item.status<>'READY_TO_PAY' then raise exception 'Aprueba la boleta antes de pagar'; end if;
  if coalesce(p_amount,0)<>item.net_amount or item.net_amount<=0 then raise exception 'El pago debe coincidir con el monto congelado'; end if;
  if p_payment_date is null or nullif(trim(coalesce(p_method,'')),'') is null or nullif(trim(coalesce(p_path,'')),'') is null then raise exception 'Pago incompleto'; end if;
  insert into public.staff_onboarding_documents
    (invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
  values(null,item.staff_id,'STAFF_PAYMENT_RECEIPT','PAGOS',to_char(item.event_date,'YYYY-MM'),'Comprobante de pago · liquidación complementaria','ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,auth.uid())
  returning id into receipt_id;
  update public.staff_complementary_settlements set status='PAID',paid_amount=p_amount,paid_at=p_payment_date,payment_method=trim(p_method),payment_reference=nullif(trim(coalesce(p_reference,'')),''),payment_idempotency_key=trim(p_idempotency_key),payment_receipt_document_id=receipt_id,updated_at=now()
   where id=item.id returning * into item;
  return item;
exception when unique_violation then
  raise exception 'El pago o la clave de idempotencia ya existe';
end;
$$;

revoke all on function public.create_staff_complementary_settlement(uuid,text),public.submit_staff_complementary_boleta(uuid,text,text,text,text,date),public.review_staff_complementary_boleta(uuid,text,text),public.register_staff_complementary_payment(uuid,date,numeric,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_staff_complementary_settlement(uuid,text),public.submit_staff_complementary_boleta(uuid,text,text,text,text,date),public.review_staff_complementary_boleta(uuid,text,text),public.register_staff_complementary_payment(uuid,date,numeric,text,text,text,text,text,text,text) to authenticated;

commit;

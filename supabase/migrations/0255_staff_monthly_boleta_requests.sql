-- Durable, idempotent requests for the explicit monthly boleta invitation.
-- This does not close a month and does not alter financial amounts.
create table if not exists public.staff_monthly_boleta_requests(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.staff_monthly_accounts(id) on delete cascade,
  staff_id uuid not null references public.staff(id),
  accounting_month date not null,
  recipient_email text not null,
  settlement_document_id uuid references public.staff_onboarding_documents(id),
  idempotency_key text not null unique,
  status text not null default 'PROCESSING' check(status in('PROCESSING','SENT','FAILED','NEEDS_RECONCILIATION')),
  provider_message_id text,
  provider_thread_id text,
  error_code text,
  lease_expires_at timestamptz not null default (now() + interval '15 minutes'),
  sent_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id)
);
create index if not exists staff_monthly_boleta_requests_month_idx
  on public.staff_monthly_boleta_requests(accounting_month,status);
alter table public.staff_monthly_boleta_requests enable row level security;
drop policy if exists staff_monthly_boleta_requests_admin_read on public.staff_monthly_boleta_requests;
create policy staff_monthly_boleta_requests_admin_read on public.staff_monthly_boleta_requests
  for select using(public.can_administer());
revoke all on public.staff_monthly_boleta_requests from public,anon,authenticated;
grant select on public.staff_monthly_boleta_requests to authenticated;

create or replace function public.claim_staff_monthly_boleta_request(
  p_account_id uuid,p_staff_id uuid,p_month date,p_recipient_email text,
  p_document_id uuid,p_idempotency_key text,p_actor uuid
)
returns table(claimed boolean, request_id uuid, status text)
language plpgsql security definer set search_path=public as $$
declare current_row public.staff_monthly_boleta_requests;
begin
  if not public.can_administer() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into current_row from public.staff_monthly_boleta_requests where account_id=p_account_id for update;
  if found and current_row.status in ('SENT','NEEDS_RECONCILIATION') then return query select false,current_row.id,current_row.status; return; end if;
  if found and current_row.status='PROCESSING' and current_row.lease_expires_at>now() then return query select false,current_row.id,current_row.status; return; end if;
  if found then
    update public.staff_monthly_boleta_requests set status='PROCESSING',recipient_email=p_recipient_email,
      settlement_document_id=p_document_id,idempotency_key=p_idempotency_key,
      lease_expires_at=now()+interval '15 minutes',error_code=null,updated_at=now() where id=current_row.id;
    return query select true,current_row.id,'PROCESSING'::text; return;
  end if;
  insert into public.staff_monthly_boleta_requests(account_id,staff_id,accounting_month,recipient_email,settlement_document_id,idempotency_key,created_by)
    values(p_account_id,p_staff_id,p_month,p_recipient_email,p_document_id,p_idempotency_key,p_actor)
    returning id into current_row.id;
  return query select true,current_row.id,'PROCESSING'::text;
end $$;
revoke all on function public.claim_staff_monthly_boleta_request(uuid,uuid,date,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_staff_monthly_boleta_request(uuid,uuid,date,text,uuid,text,uuid) to authenticated;

create or replace function public.complete_staff_monthly_boleta_request(p_request_id uuid,p_status text,p_message_id text default null,p_thread_id text default null,p_error_code text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_administer() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in('SENT','FAILED','NEEDS_RECONCILIATION') then raise exception 'INVALID_STATUS'; end if;
  update public.staff_monthly_boleta_requests set status=p_status,provider_message_id=p_message_id,provider_thread_id=p_thread_id,error_code=p_error_code,sent_at=case when p_status='SENT' then now() else null end,lease_expires_at=now(),updated_at=now() where id=p_request_id;
end $$;
revoke all on function public.complete_staff_monthly_boleta_request(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_staff_monthly_boleta_request(uuid,text,text,text,text) to authenticated;

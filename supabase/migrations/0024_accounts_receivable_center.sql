begin;

create table if not exists public.customer_financial_profiles (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null unique references public.customers(id),
  customer_type text not null check(customer_type in ('PRIVATE','CORPORATE')), default_payment_term text not null default 'CASH' check(default_payment_term in ('CASH','DAYS_15','DAYS_30','DAYS_45','DAYS_60','DAYS_90','CUSTOM')),
  custom_term_days integer check(custom_term_days is null or custom_term_days between 1 and 365), purchase_order_required boolean not null default false,
  version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_by uuid references auth.users(id), deleted_at timestamptz
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(), invoice_number text not null unique, customer_id uuid not null references public.customers(id), project_id uuid not null references public.projects(id), quotation_id uuid references public.quotations(id), agreement_id uuid references public.agreements(id), orbit_event_id text not null,
  customer_type text not null check(customer_type in ('PRIVATE','CORPORATE')), status text not null default 'DRAFT' check(status in ('DRAFT','ISSUED','PENDING','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED')),
  issue_date date, due_date date, payment_term text not null default 'CASH' check(payment_term in ('CASH','DAYS_15','DAYS_30','DAYS_45','DAYS_60','DAYS_90','CUSTOM')), custom_term_days integer check(custom_term_days is null or custom_term_days between 1 and 365), purchase_order text,
  currency text not null default 'CLP', amount numeric(14,2) not null check(amount>=0), paid_amount numeric(14,2) not null default 0 check(paid_amount>=0), notes text,
  issued_by uuid references auth.users(id), issued_at timestamptz, closed_at timestamptz, cancelled_at timestamptz,
  version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), approved_by uuid references auth.users(id), approved_at timestamptz, approval_reason text, deleted_by uuid references auth.users(id), deleted_at timestamptz,
  constraint invoice_paid_not_above_amount check(paid_amount<=amount), constraint private_customer_no_credit check(customer_type='CORPORATE' or payment_term='CASH')
);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id), amount numeric(14,2) not null check(amount>0), paid_at timestamptz not null, method text not null, reference text, reason text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);

create index if not exists invoices_customer_idx on public.invoices(customer_id,due_date) where deleted_at is null;
create index if not exists invoices_project_idx on public.invoices(project_id,created_at desc) where deleted_at is null;
create index if not exists invoices_status_due_idx on public.invoices(status,due_date) where deleted_at is null;
create index if not exists invoice_payments_invoice_idx on public.invoice_payments(invoice_id,paid_at desc);

create or replace function public.invoice_term_days(term text, custom_days integer) returns integer language sql immutable as $$
  select case term when 'CASH' then 0 when 'DAYS_15' then 15 when 'DAYS_30' then 30 when 'DAYS_45' then 45 when 'DAYS_60' then 60 when 'DAYS_90' then 90 when 'CUSTOM' then custom_days end
$$;

create or replace function public.prepare_invoice() returns trigger language plpgsql set search_path=public as $$
begin
  if new.payment_term='CUSTOM' and new.custom_term_days is null then raise exception 'Los días personalizados son obligatorios.'; end if;
  if new.status<>'DRAFT' and new.issue_date is null then new.issue_date=current_date; end if;
  if new.issue_date is not null then new.due_date=new.issue_date+public.invoice_term_days(new.payment_term,new.custom_term_days); end if;
  if new.paid_amount=new.amount and new.amount>0 then new.status='PAID'; new.closed_at=coalesce(new.closed_at,now());
  elsif new.paid_amount>0 and new.status<>'CANCELLED' then new.status='PARTIALLY_PAID';
  elsif new.status not in ('DRAFT','CANCELLED') then new.status=case when new.due_date<current_date then 'OVERDUE' else 'PENDING' end; end if;
  return new;
end $$;

drop trigger if exists invoices_prepare on public.invoices;
create trigger invoices_prepare before insert or update on public.invoices for each row execute function public.prepare_invoice();
drop trigger if exists customer_financial_profiles_touch on public.customer_financial_profiles;
create trigger customer_financial_profiles_touch before update on public.customer_financial_profiles for each row execute function public.touch_versioned_row();
drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices for each row execute function public.touch_versioned_row();
drop trigger if exists customer_financial_profiles_audit on public.customer_financial_profiles;
create trigger customer_financial_profiles_audit after insert or update or delete on public.customer_financial_profiles for each row execute function public.audit_row_change();
drop trigger if exists invoices_audit on public.invoices;
create trigger invoices_audit after insert or update or delete on public.invoices for each row execute function public.audit_row_change();
drop trigger if exists invoice_payments_audit on public.invoice_payments;
create trigger invoice_payments_audit after insert on public.invoice_payments for each row execute function public.audit_row_change();
revoke update,delete on public.invoice_payments from authenticated;

alter table public.customer_financial_profiles enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_payments enable row level security;
create policy customer_financial_profiles_internal_read on public.customer_financial_profiles for select using(public.is_internal_user());
create policy customer_financial_profiles_finance_write on public.customer_financial_profiles for all using(public.can_administer() or public.current_orbit_role() in ('SALES','OPERATIONS')) with check(public.can_administer() or public.current_orbit_role() in ('SALES','OPERATIONS'));
create policy invoices_internal_read on public.invoices for select using(public.is_internal_user());
create policy invoices_finance_write on public.invoices for all using(public.can_administer() or public.current_orbit_role() in ('SALES','OPERATIONS')) with check(public.can_administer() or public.current_orbit_role() in ('SALES','OPERATIONS'));
create policy invoice_payments_internal_read on public.invoice_payments for select using(public.is_internal_user());
create policy invoice_payments_finance_insert on public.invoice_payments for insert with check(public.can_administer() or public.current_orbit_role() in ('SALES','OPERATIONS'));

create or replace view public.accounts_receivable_projection with (security_invoker=true) as
select i.*,greatest(i.amount-i.paid_amount,0)::numeric(14,2) outstanding_balance,
  case when i.status='CANCELLED' then 'CANCELLED' when i.paid_amount=i.amount then 'PAID' when i.paid_amount>0 then 'PARTIALLY_PAID' when i.status='DRAFT' then 'DRAFT' when i.due_date<current_date then 'OVERDUE' else 'PENDING' end effective_status,
  case when i.due_date is null then null else i.due_date-current_date end days_remaining,
  case when i.due_date is null or i.due_date>=current_date or i.amount=i.paid_amount then 'CURRENT' when current_date-i.due_date<=15 then '15' when current_date-i.due_date<=30 then '30' when current_date-i.due_date<=60 then '60' else '90+' end aging_bucket
from public.invoices i where i.deleted_at is null;

create or replace function public.record_invoice_payment(p_invoice_id uuid,p_amount numeric,p_method text,p_reference text default null,p_reason text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare inv public.invoices%rowtype; payment_id uuid; actor uuid:=auth.uid(); correlation text;
begin
  if not(public.can_administer() or public.current_orbit_role() in ('SALES','OPERATIONS')) then raise exception 'Permiso financiero requerido.'; end if;
  select * into inv from public.invoices where id=p_invoice_id and deleted_at is null for update; if not found then raise exception 'Factura no encontrada.'; end if;
  if inv.status in ('CANCELLED','PAID') then raise exception 'La factura no admite pagos.'; end if;
  if p_amount<=0 or inv.paid_amount+p_amount>inv.amount then raise exception 'Monto de pago inválido.'; end if;
  insert into public.invoice_payments(invoice_id,amount,paid_at,method,reference,reason,created_by) values(inv.id,p_amount,now(),p_method,p_reference,p_reason,actor) returning id into payment_id;
  update public.invoices set paid_amount=paid_amount+p_amount,updated_by=actor,approval_reason=p_reason where id=inv.id;
  correlation='invoice-payment:'||payment_id;
  insert into public.timeline_events(customer_id,project_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
  values(inv.customer_id,inv.project_id,'PAYMENT_RECEIVED','Pago recibido.','Pago aplicado a '||inv.invoice_number||'.',inv.orbit_event_id,actor,'Finanzas','Administrator','PAYMENT_RECEIVED','Invoice',inv.id,'Pago recibido por '||to_char(p_amount,'FM$999G999G999')||' en '||inv.invoice_number||'.',correlation,actor);
  if inv.paid_amount+p_amount=inv.amount then insert into public.timeline_events(customer_id,project_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by) values(inv.customer_id,inv.project_id,'INVOICE_CLOSED','Factura pagada.','Saldo completamente pagado.',inv.orbit_event_id,actor,'Finanzas','Administrator','INVOICE_CLOSED','Invoice',inv.id,'Factura '||inv.invoice_number||' pagada completamente.',correlation||':closed',actor); end if;
  return payment_id;
end $$;
revoke all on function public.record_invoice_payment(uuid,numeric,text,text,text) from public,anon; grant execute on function public.record_invoice_payment(uuid,numeric,text,text,text) to authenticated;

create or replace function public.invoice_timeline_dispatch() returns trigger language plpgsql security definer set search_path=public as $$
declare action_name text; message text; correlation text;
begin
  if tg_op='INSERT' then action_name=case when new.status='DRAFT' then 'INVOICE_DRAFTED' else 'INVOICE_ISSUED' end;
  elsif old.status is distinct from new.status and new.status='OVERDUE' then action_name='INVOICE_OVERDUE';
  elsif old.status is distinct from new.status and new.status='CANCELLED' then action_name='INVOICE_CANCELLED'; else return new; end if;
  message=case action_name when 'INVOICE_DRAFTED' then 'Factura '||new.invoice_number||' creada como borrador.' when 'INVOICE_ISSUED' then 'Factura '||new.invoice_number||' emitida.' when 'INVOICE_OVERDUE' then 'Factura '||new.invoice_number||' vencida.' else 'Factura '||new.invoice_number||' anulada.' end; correlation='invoice:'||new.id||':'||action_name;
  insert into public.timeline_events(customer_id,project_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by) values(new.customer_id,new.project_id,action_name,message,message,new.orbit_event_id,auth.uid(),'Finanzas','Administrator',action_name,'Invoice',new.id,message,correlation,auth.uid()) on conflict(correlation_id) do nothing;
  return new;
end $$;
drop trigger if exists invoice_timeline_dispatch on public.invoices;
create trigger invoice_timeline_dispatch after insert or update of status on public.invoices for each row execute function public.invoice_timeline_dispatch();

create or replace function public.refresh_receivable_notifications() returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  if not public.is_internal_user() then raise exception 'Acceso interno requerido.'; end if;
  update public.invoices set status='OVERDUE',updated_by=auth.uid(),approval_reason='Vencimiento automático' where deleted_at is null and status in ('ISSUED','PENDING') and due_date<current_date;
  insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
  select project_id,customer_id,case when days_remaining<0 then 'INVOICE_OVERDUE' when days_remaining=0 then 'INVOICE_DUE_TODAY' else 'INVOICE_DUE_SOON' end,
    case when days_remaining<0 then 'Factura vencida' when days_remaining=0 then 'Factura vence hoy' else 'Próximo vencimiento' end,
    invoice_number||' · saldo '||to_char(outstanding_balance,'FM$999G999G999'),'UNREAD','invoice-reminder:'||id||':'||days_remaining,'PAYMENTS',case when days_remaining<0 then 'CRITICAL' when days_remaining=0 then 'HIGH' else 'NORMAL' end,true,'Invoice',id::text,'/finance/receivables',jsonb_build_object('days_remaining',days_remaining,'outstanding_balance',outstanding_balance)
  from public.accounts_receivable_projection where effective_status in ('PENDING','PARTIALLY_PAID','OVERDUE') and days_remaining in (7,3,0) or (effective_status='OVERDUE' and days_remaining=-1)
  on conflict(correlation_id) do nothing; get diagnostics affected=row_count; return affected;
end $$;
revoke all on function public.refresh_receivable_notifications() from public,anon; grant execute on function public.refresh_receivable_notifications() to authenticated;

do $$ begin alter publication supabase_realtime add table public.invoices,public.invoice_payments; exception when duplicate_object then null; end $$;
commit;

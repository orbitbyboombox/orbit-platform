begin;

alter table public.event_staff_payments drop constraint if exists event_staff_payments_paid_amount_check;
alter table public.event_staff_payments add constraint event_staff_payments_paid_amount_check check(paid_amount>=0);
alter table public.event_staff_payments add column if not exists accounting_month date;
update public.event_staff_payments payment set accounting_month=date_trunc('month',project.event_date)::date
from public.projects project where project.id=payment.project_id and payment.accounting_month is null;
alter table public.event_staff_payments alter column accounting_month set not null;
alter table public.event_staff_payments add constraint event_staff_payments_accounting_month_check check(date_trunc('month',accounting_month)::date=accounting_month);

create table if not exists public.event_staff_settlement_movements(
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.event_staff_payments(id),
  movement_type text not null check(movement_type in('ADVANCE','PAYMENT','REVERSAL')),
  amount numeric(14,2) not null check(amount>0),
  movement_date date not null default current_date,
  method text,
  receipt_path text,
  notes text,
  legacy_source text unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists event_staff_settlement_movements_settlement_idx on public.event_staff_settlement_movements(settlement_id,movement_date,created_at) where deleted_at is null;

alter table public.event_staff_settlement_movements enable row level security;
drop policy if exists event_staff_settlement_movements_internal_read on public.event_staff_settlement_movements;
create policy event_staff_settlement_movements_internal_read on public.event_staff_settlement_movements for select using(public.is_internal_user());
drop policy if exists event_staff_settlement_movements_admin_write on public.event_staff_settlement_movements;
create policy event_staff_settlement_movements_admin_write on public.event_staff_settlement_movements for all using(public.can_administer()) with check(public.can_administer());

create or replace function public.recalculate_event_staff_settlement(p_settlement_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare total_paid numeric(14,2);last_paid date;net numeric(14,2);
begin
  select coalesce(sum(case when movement_type='REVERSAL' then -amount else amount end),0),max(movement_date)
  into total_paid,last_paid from public.event_staff_settlement_movements where settlement_id=p_settlement_id and deleted_at is null;
  select total_internal_payment into net from public.event_staff_payments where id=p_settlement_id and deleted_at is null;
  if net is null then return;end if;
  update public.event_staff_payments set paid_amount=greatest(total_paid,0),paid_at=case when total_paid>0 then last_paid else null end,
    settlement_status=case when total_paid<=0 then 'PENDING' when total_paid>=net then 'PAID' else 'ADVANCE' end,
    updated_at=now(),updated_by=coalesce(auth.uid(),updated_by) where id=p_settlement_id;
end $$;

create or replace function public.event_staff_settlement_movement_changed()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.recalculate_event_staff_settlement(coalesce(new.settlement_id,old.settlement_id));return coalesce(new,old);end $$;
drop trigger if exists event_staff_settlement_movement_sync on public.event_staff_settlement_movements;
create trigger event_staff_settlement_movement_sync after insert or update or delete on public.event_staff_settlement_movements for each row execute function public.event_staff_settlement_movement_changed();

create or replace function public.register_staff_settlement_movement(p_settlement_id uuid,p_type text,p_amount numeric,p_date date,p_method text,p_notes text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede registrar pagos de Staff.';end if;
  if p_type not in('ADVANCE','PAYMENT','REVERSAL') or coalesce(p_amount,0)<=0 then raise exception 'Movimiento de liquidación inválido.';end if;
  if not exists(select 1 from public.event_staff_payments where id=p_settlement_id and deleted_at is null and status='CONFIRMED') then raise exception 'Liquidación confirmada no encontrada.';end if;
  insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,notes,created_by,updated_by)
  values(p_settlement_id,p_type,p_amount,coalesce(p_date,current_date),nullif(trim(p_method),''),nullif(trim(p_notes),''),auth.uid(),auth.uid()) returning id into result;
  return result;
end $$;
grant execute on function public.register_staff_settlement_movement(uuid,text,numeric,date,text,text) to authenticated;

create or replace function public.update_staff_settlement_receipt(p_settlement_id uuid,p_receipt_status text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if not public.can_administer()then raise exception 'Solo Administración puede actualizar la boleta.';end if;
  if p_receipt_status not in('PENDING','RECEIVED')then raise exception 'Estado de boleta inválido.';end if;
  update public.event_staff_payments set sii_receipt_status=p_receipt_status,sii_receipt_received_at=case when p_receipt_status='RECEIVED'then coalesce(sii_receipt_received_at,now())else null end,updated_by=auth.uid()
  where id=p_settlement_id and deleted_at is null and status='CONFIRMED';
  if not found then raise exception 'Liquidación confirmada no encontrada.';end if;
end $$;
grant execute on function public.update_staff_settlement_receipt(uuid,text)to authenticated;

-- Historical advances are attached once to the only confirmed settlement for
-- the collaborator, preferring an Event name explicitly mentioned in notes.
insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,notes,legacy_source,created_by,updated_by)
select candidate.id,'ADVANCE',advance.amount,advance.created_at::date,advance.notes,'staff_payment_advances:'||advance.id,advance.created_by,advance.created_by
from public.staff_payment_advances advance
join public.staff_payment_months month_record on month_record.id=advance.payment_month_id
join lateral(
  select settlement.id from public.event_staff_payments settlement join public.projects project on project.id=settlement.project_id
  where settlement.staff_id=month_record.staff_id and settlement.deleted_at is null and settlement.status='CONFIRMED'
  order by (lower(coalesce(advance.notes,'')) like '%'||lower(project.name)||'%') desc,abs(project.event_date-advance.created_at::date),settlement.created_at desc limit 1
)candidate on true
on conflict(legacy_source)do nothing;

do $$declare item record;begin for item in select id from public.event_staff_payments where deleted_at is null loop perform public.recalculate_event_staff_settlement(item.id);end loop;end$$;

alter table public.expenses add column if not exists event_staff_settlement_id uuid references public.event_staff_payments(id);
update public.expenses expense set event_staff_settlement_id=settlement.id
from public.event_staff_payments settlement
where expense.project_id=settlement.project_id and expense.responsible_staff_id=settlement.staff_id and expense.deleted_at is null
  and settlement.deleted_at is null and settlement.status='CONFIRMED' and expense.event_staff_settlement_id is null;
create index if not exists expenses_event_staff_settlement_idx on public.expenses(event_staff_settlement_id) where deleted_at is null and event_staff_settlement_id is not null;

create or replace function public.validate_expense_event_staff_settlement()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.event_staff_settlement_id is not null and not exists(select 1 from public.event_staff_payments settlement where settlement.id=new.event_staff_settlement_id and settlement.project_id=new.project_id and settlement.staff_id=new.responsible_staff_id and settlement.deleted_at is null and settlement.status='CONFIRMED')then raise exception 'El gasto debe pertenecer a la liquidación confirmada del Evento y colaborador.';end if;
  return new;
end $$;
drop trigger if exists expenses_event_staff_settlement_validate on public.expenses;
create trigger expenses_event_staff_settlement_validate before insert or update of project_id,responsible_staff_id,event_staff_settlement_id on public.expenses for each row execute function public.validate_expense_event_staff_settlement();

create or replace view public.staff_worked_events with(security_invoker=true)as
select settlement.id settlement_id,settlement.staff_id,settlement.project_id,project.event_date,project.name event_name,customer.full_name customer,
  coalesce((select string_agg(service.service_code,' + ' order by service.service_code)from public.project_services service where service.project_id=project.id),project.project_type)service,
  settlement.tasks roles,settlement.total_internal_payment generated_net,settlement.paid_amount paid_amount,
  greatest(settlement.total_internal_payment-settlement.paid_amount,0)remaining_balance,greatest(settlement.paid_amount-settlement.total_internal_payment,0)credit_balance,
  settlement.settlement_status,settlement.sii_receipt_status,settlement.accounting_month
from public.event_staff_payments settlement join public.projects project on project.id=settlement.project_id join public.customers customer on customer.id=project.customer_id
where settlement.deleted_at is null and settlement.status='CONFIRMED' and settlement.total_internal_payment>0;

create or replace view public.staff_monthly_payroll with(security_invoker=true)as
select staff_id,accounting_month,count(*)events_worked,sum(generated_net)generated_net,sum(paid_amount)paid_amount,
  sum(remaining_balance)remaining_balance,sum(credit_balance)credit_balance,
  count(*)filter(where sii_receipt_status='PENDING')receipt_pending,count(*)filter(where sii_receipt_status='RECEIVED')receipt_received
from public.staff_worked_events group by staff_id,accounting_month;

-- Compatibility tables remain readable for audit only.
drop policy if exists staff_payment_months_admin_write on public.staff_payment_months;
drop policy if exists staff_payment_advances_admin_write on public.staff_payment_advances;
drop policy if exists staff_payment_documents_admin_write on public.staff_payment_documents;
revoke insert,update,delete on public.staff_payment_months,public.staff_payment_advances,public.staff_payment_documents from authenticated;

commit;

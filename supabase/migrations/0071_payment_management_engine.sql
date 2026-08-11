begin;

alter table public.invoice_payments drop constraint if exists invoice_payments_amount_check;
alter table public.invoice_payments add constraint invoice_payments_amount_non_zero check(amount<>0);
alter table public.invoice_payments add column if not exists movement_type text not null default 'PARTIAL_PAYMENT';
alter table public.invoice_payments add column if not exists receipt_path text;
alter table public.invoice_payments add column if not exists reversed_payment_id uuid references public.invoice_payments(id);

create or replace view public.accounts_receivable_projection with(security_invoker=true) as
select i.*,greatest(i.amount-i.paid_amount,0)::numeric(14,2) outstanding_balance,
  case when i.status='CANCELLED' then 'CANCELLED' when i.paid_amount=i.amount and i.amount>0 then 'PAID' when i.paid_amount>0 then 'PARTIALLY_PAID' when i.status='DRAFT' then 'DRAFT' when i.due_date<current_date then 'OVERDUE' else 'PENDING' end effective_status,
  case when i.due_date is null then null else i.due_date-current_date end days_remaining,
  case when i.due_date is null or i.due_date>=current_date or i.amount=i.paid_amount then 'CURRENT' when current_date-i.due_date<=15 then '15' when current_date-i.due_date<=30 then '30' when current_date-i.due_date<=60 then '60' else '90+' end aging_bucket,
  coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'paidAt',p.paid_at,'method',p.method,'reason',p.reason,'type',p.movement_type,'receiptPath',p.receipt_path) order by p.paid_at desc,p.created_at desc) from invoice_payments p where p.invoice_id=i.id),'[]'::jsonb) payment_history
from public.invoices i where i.deleted_at is null;

create table if not exists public.receivable_movements(
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  movement_type text not null check(movement_type in('DEPOSIT','PARTIAL_PAYMENT','FULL_PAYMENT','RETURN_PENDING','CANCEL','DELETE')),
  amount numeric(14,2) not null default 0,
  effective_amount numeric(14,2) not null default 0,
  occurred_at timestamptz not null,
  method text,
  receipt_path text,
  reason text not null check(length(trim(reason))>=3),
  actor_id uuid not null references auth.users(id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists receivable_movements_invoice_idx on public.receivable_movements(invoice_id,occurred_at desc,created_at desc);
alter table public.receivable_movements enable row level security;
drop policy if exists receivable_movements_internal_read on public.receivable_movements;
create policy receivable_movements_internal_read on public.receivable_movements for select using(public.is_internal_user());
revoke insert,update,delete,truncate on public.receivable_movements from public,anon,authenticated;

create or replace function public.apply_receivable_movement(
  p_invoice_id uuid,p_action text,p_amount numeric,p_occurred_at timestamptz,p_method text,p_receipt_path text,p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); inv invoices%rowtype; action text:=upper(trim(p_action)); movement_id uuid; effective numeric:=0; payment_id uuid; current_paid numeric;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede gestionar pagos.'; end if;
  if action not in('DEPOSIT','PARTIAL_PAYMENT','FULL_PAYMENT','RETURN_PENDING','CANCEL','DELETE') then raise exception 'Acción financiera no válida.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo es obligatorio.'; end if;
  select * into inv from invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Cuenta por cobrar no encontrada.'; end if;
  current_paid:=inv.paid_amount;

  if action in('DEPOSIT','PARTIAL_PAYMENT') then
    effective:=p_amount;
    if effective<=0 or current_paid+effective>inv.amount then raise exception 'El monto supera el saldo pendiente.'; end if;
  elsif action='FULL_PAYMENT' then
    effective:=inv.amount-current_paid;
    if effective<=0 then raise exception 'La cuenta ya está completamente pagada.'; end if;
  elsif action='RETURN_PENDING' then
    effective:=-current_paid;
    if current_paid<=0 then raise exception 'La cuenta ya se encuentra pendiente.'; end if;
  end if;

  insert into receivable_movements(invoice_id,movement_type,amount,effective_amount,occurred_at,method,receipt_path,reason,actor_id,metadata)
  values(inv.id,action,abs(effective),effective,coalesce(p_occurred_at,now()),nullif(p_method,''),nullif(p_receipt_path,''),trim(p_reason),actor,
    jsonb_build_object('previousPaid',current_paid,'saleTotal',inv.amount,'previousStatus',inv.status)) returning id into movement_id;

  if effective<>0 then
    insert into invoice_payments(invoice_id,amount,paid_at,method,reference,reason,created_by,movement_type,receipt_path)
    values(inv.id,effective,coalesce(p_occurred_at,now()),coalesce(nullif(p_method,''),case when effective<0 then 'REVERSAL' else 'OTHER' end),movement_id::text,trim(p_reason),actor,action,nullif(p_receipt_path,'')) returning id into payment_id;
    update invoices set paid_amount=greatest(0,least(amount,current_paid+effective)),status=case when current_paid+effective>=amount then 'PAID' when current_paid+effective>0 then 'PARTIALLY_PAID' else 'PENDING' end,
      cancelled_at=null,closed_at=case when current_paid+effective>=amount then now() else null end,approval_reason=trim(p_reason),updated_by=actor where id=inv.id;
  elsif action='CANCEL' then
    update invoices set status='CANCELLED',cancelled_at=now(),approval_reason=trim(p_reason),updated_by=actor where id=inv.id;
  elsif action='DELETE' then
    update invoices set deleted_at=now(),deleted_by=actor,approval_reason=trim(p_reason),updated_by=actor where id=inv.id;
  end if;

  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(inv.customer_id,inv.project_id,inv.orbit_event_id,'RECEIVABLE_'||action,
    case action when 'DEPOSIT' then 'Reserva recibida' when 'PARTIAL_PAYMENT' then 'Pago parcial recibido' when 'FULL_PAYMENT' then 'Pago total recibido' when 'RETURN_PENDING' then 'Cuenta restablecida a pendiente' when 'CANCEL' then 'Cuenta por cobrar cancelada' else 'Cuenta por cobrar eliminada' end,
    trim(p_reason),actor,'Founder','Administrator','RECEIVABLE_'||action,'Invoice',inv.id,
    case when effective<>0 then 'Movimiento financiero por '||to_char(effective,'FM$999G999G999')||'.' else trim(p_reason) end,
    'receivable-movement:'||movement_id,trim(p_reason),actor);
  perform public.sync_financial_event(inv.project_id);
  return movement_id;
end $$;

revoke all on function public.apply_receivable_movement(uuid,text,numeric,timestamptz,text,text,text) from public,anon;
grant execute on function public.apply_receivable_movement(uuid,text,numeric,timestamptz,text,text,text) to authenticated;

do $$ begin alter publication supabase_realtime add table public.receivable_movements; exception when duplicate_object then null; end $$;

commit;

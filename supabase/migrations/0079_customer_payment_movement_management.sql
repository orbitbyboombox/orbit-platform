begin;

alter table public.invoice_payments add column if not exists updated_at timestamptz;
alter table public.invoice_payments add column if not exists updated_by uuid references auth.users(id);
alter table public.invoice_payments add column if not exists deleted_at timestamptz;
alter table public.invoice_payments add column if not exists deleted_by uuid references auth.users(id);

create table if not exists public.receivable_movement_revisions(
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_id uuid not null references public.invoice_payments(id),
  action text not null check(action in('EDIT','DELETE')),
  original_amount numeric(14,2) not null,
  new_amount numeric(14,2),
  original_date timestamptz not null,
  new_date timestamptz,
  original_method text,
  new_method text,
  original_receipt_path text,
  new_receipt_path text,
  reason text not null check(length(trim(reason))>=3),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.receivable_movement_revisions enable row level security;
drop policy if exists receivable_movement_revisions_internal_read on public.receivable_movement_revisions;
create policy receivable_movement_revisions_internal_read on public.receivable_movement_revisions for select using(public.is_internal_user());
revoke insert,update,delete,truncate on public.receivable_movement_revisions from public,anon,authenticated;

create or replace view public.accounts_receivable_projection with(security_invoker=true) as
select i.*,greatest(i.amount-i.paid_amount,0)::numeric(14,2) outstanding_balance,
  case when i.status='CANCELLED' then 'CANCELLED' when i.paid_amount=i.amount and i.amount>0 then 'PAID' when i.paid_amount>0 then 'PARTIALLY_PAID' when i.status='DRAFT' then 'DRAFT' when i.due_date<current_date then 'OVERDUE' else 'PENDING' end effective_status,
  case when i.due_date is null then null else i.due_date-current_date end days_remaining,
  case when i.due_date is null or i.due_date>=current_date or i.amount=i.paid_amount then 'CURRENT' when current_date-i.due_date<=15 then '15' when current_date-i.due_date<=30 then '30' when current_date-i.due_date<=60 then '60' else '90+' end aging_bucket,
  coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'paidAt',p.paid_at,'method',p.method,'reason',p.reason,'type',p.movement_type,'receiptPath',p.receipt_path) order by p.paid_at desc,p.created_at desc) from invoice_payments p where p.invoice_id=i.id and p.deleted_at is null),'[]'::jsonb) payment_history
from public.invoices i where i.deleted_at is null;

create or replace function public.manage_receivable_payment(
  p_invoice_id uuid,p_payment_id uuid,p_action text,p_amount numeric,p_paid_at timestamptz,p_method text,p_receipt_path text,p_reason text
) returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); inv invoices%rowtype; payment invoice_payments%rowtype; next_paid numeric; action text:=upper(trim(p_action)); movement uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede gestionar movimientos.'; end if;
  if action not in('EDIT','DELETE') then raise exception 'Acción de movimiento no válida.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo es obligatorio.'; end if;
  select * into inv from invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Cuenta por cobrar no encontrada.'; end if;
  select * into payment from invoice_payments where id=p_payment_id and invoice_id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Movimiento de pago no encontrado.'; end if;
  if action='EDIT' and (p_amount is null or p_amount=0 or p_paid_at is null or length(trim(coalesce(p_method,'')))=0) then raise exception 'Monto, fecha y método son obligatorios.'; end if;

  insert into receivable_movement_revisions(invoice_id,payment_id,action,original_amount,new_amount,original_date,new_date,original_method,new_method,original_receipt_path,new_receipt_path,reason,actor_id)
  values(inv.id,payment.id,action,payment.amount,case when action='EDIT' then p_amount end,payment.paid_at,case when action='EDIT' then p_paid_at end,payment.method,case when action='EDIT' then trim(p_method) end,payment.receipt_path,case when action='EDIT' then coalesce(nullif(p_receipt_path,''),payment.receipt_path) end,trim(p_reason),actor);

  if action='EDIT' then
    update invoice_payments set amount=p_amount,paid_at=p_paid_at,method=trim(p_method),receipt_path=coalesce(nullif(p_receipt_path,''),receipt_path),reason=trim(p_reason),updated_at=now(),updated_by=actor where id=payment.id;
  else
    update invoice_payments set deleted_at=now(),deleted_by=actor,updated_at=now(),updated_by=actor where id=payment.id;
  end if;
  select greatest(coalesce(sum(amount),0),0) into next_paid from invoice_payments where invoice_id=inv.id and deleted_at is null;
  if next_paid>inv.amount then raise exception 'Los movimientos superan el valor total del Evento.'; end if;
  update invoices set paid_amount=next_paid,status=case when next_paid>=amount and amount>0 then 'PAID' when next_paid>0 then 'PARTIALLY_PAID' else 'PENDING' end,closed_at=case when next_paid>=amount and amount>0 then now() else null end,cancelled_at=null,approval_reason=trim(p_reason),updated_by=actor where id=inv.id;
  begin movement:=nullif(payment.reference,'')::uuid; exception when invalid_text_representation then movement:=null; end;
  if movement is not null then update receivable_movements set metadata=metadata||jsonb_build_object('managedAction',action,'managedAt',now(),'managedBy',actor,'managementReason',trim(p_reason)) where id=movement; end if;
  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(inv.customer_id,inv.project_id,inv.orbit_event_id,'PAYMENT_MOVEMENT_'||action,case when action='EDIT' then 'Movimiento de pago corregido' else 'Movimiento de pago eliminado' end,trim(p_reason),actor,'Founder','Administrator','PAYMENT_MOVEMENT_'||action,'InvoicePayment',payment.id,case when action='EDIT' then 'El movimiento fue actualizado y los saldos fueron recalculados.' else 'El movimiento fue eliminado de la operación activa y los saldos fueron recalculados.' end,'payment-management:'||gen_random_uuid(),trim(p_reason),actor);
  perform public.sync_financial_event(inv.project_id);
  perform public.sync_event_profitability(inv.project_id);
end $$;
revoke all on function public.manage_receivable_payment(uuid,uuid,text,numeric,timestamptz,text,text,text) from public,anon;
grant execute on function public.manage_receivable_payment(uuid,uuid,text,numeric,timestamptz,text,text,text) to authenticated;

commit;

begin;

alter table public.invoice_payments add column if not exists receipt_name text;

create or replace view public.accounts_receivable_projection with(security_invoker=true) as
select i.*,greatest(i.amount-i.paid_amount,0)::numeric(14,2) outstanding_balance,
  case when i.status='CANCELLED' then 'CANCELLED' when i.paid_amount=i.amount and i.amount>0 then 'PAID' when i.paid_amount>0 then 'PARTIALLY_PAID' when i.status='DRAFT' then 'DRAFT' when i.due_date<current_date then 'OVERDUE' else 'PENDING' end effective_status,
  case when i.due_date is null then null else i.due_date-current_date end days_remaining,
  case when i.due_date is null or i.due_date>=current_date or i.amount=i.paid_amount then 'CURRENT' when current_date-i.due_date<=15 then '15' when current_date-i.due_date<=30 then '30' when current_date-i.due_date<=60 then '60' else '90+' end aging_bucket,
  coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'paidAt',p.paid_at,'method',p.method,'observation',p.reason,'type',p.movement_type,'receiptPath',p.receipt_path,'receiptName',coalesce(p.receipt_name,regexp_replace(p.receipt_path,'^.*/','')),'createdBy',p.created_by,'createdAt',p.created_at) order by p.paid_at desc,p.created_at desc) from invoice_payments p where p.invoice_id=i.id and p.deleted_at is null and p.amount>0),'[]'::jsonb) payment_history
from public.invoices i where i.deleted_at is null;

create or replace function public.register_receivable_payment(p_invoice_id uuid,p_amount numeric,p_paid_at timestamptz,p_method text,p_receipt_path text,p_receipt_name text,p_observation text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); inv invoices%rowtype; payment_id uuid; movement_id uuid; next_paid numeric; note text:=coalesce(nullif(trim(p_observation),''),'Pago registrado desde Perfil del Cliente');
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede registrar pagos.'; end if;
  select * into inv from invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Cuenta por cobrar no encontrada.'; end if;
  if inv.status='CANCELLED' then raise exception 'La cuenta por cobrar está cancelada.'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if p_paid_at is null or length(trim(coalesce(p_method,'')))=0 then raise exception 'Fecha y método son obligatorios.'; end if;
  next_paid:=inv.paid_amount+p_amount;
  if next_paid>inv.amount then raise exception 'El pago supera el saldo pendiente.'; end if;
  insert into receivable_movements(invoice_id,movement_type,amount,effective_amount,occurred_at,method,receipt_path,reason,actor_id,metadata)
  values(inv.id,'PARTIAL_PAYMENT',p_amount,p_amount,p_paid_at,trim(p_method),nullif(p_receipt_path,''),note,actor,jsonb_build_object('previousPaid',inv.paid_amount,'saleTotal',inv.amount,'receiptName',nullif(p_receipt_name,''),'ledgerEntry',true)) returning id into movement_id;
  insert into invoice_payments(invoice_id,amount,paid_at,method,reference,reason,created_by,movement_type,receipt_path,receipt_name)
  values(inv.id,p_amount,p_paid_at,trim(p_method),movement_id::text,note,actor,'PARTIAL_PAYMENT',nullif(p_receipt_path,''),nullif(p_receipt_name,'')) returning id into payment_id;
  update invoices set paid_amount=next_paid,status=case when next_paid=amount then 'PAID' else 'PARTIALLY_PAID' end,closed_at=case when next_paid=amount then now() else null end,cancelled_at=null,approval_reason=note,updated_by=actor where id=inv.id;
  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(inv.customer_id,inv.project_id,inv.orbit_event_id,'PAYMENT_REGISTERED','Nuevo pago registrado',note,actor,'Founder','Administrator','PAYMENT_REGISTERED','InvoicePayment',payment_id,'Se registró un nuevo pago independiente por '||to_char(p_amount,'FM$999G999G999')||'.','payment-ledger:'||payment_id,note,actor);
  perform public.sync_financial_event(inv.project_id);
  perform public.sync_event_profitability(inv.project_id);
  return payment_id;
end $$;
revoke all on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text) from public,anon;
grant execute on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text) to authenticated;

commit;

begin;

alter table public.invoices add column if not exists financial_record_state text not null default 'ACTIVE' check(financial_record_state in('ACTIVE','ARCHIVED','CANCELLED','DELETED'));
alter table public.invoices add column if not exists record_origin text not null default 'PRODUCTION' check(record_origin in('PRODUCTION','QA'));
alter table public.invoices add column if not exists archived_at timestamptz;
alter table public.invoices add column if not exists archived_by uuid references auth.users(id);
update public.invoices set financial_record_state=case when deleted_at is not null then 'DELETED' when status='CANCELLED' then 'CANCELLED' else financial_record_state end;
update public.invoices i set record_origin='QA' from public.customers c where i.customer_id=c.id and coalesce(c.metadata->>'record_type','')='SYSTEM_CERTIFICATION';

alter table public.receivable_movements drop constraint if exists receivable_movements_movement_type_check;
alter table public.receivable_movements add constraint receivable_movements_movement_type_check check(movement_type in('DEPOSIT','PARTIAL_PAYMENT','FULL_PAYMENT','RETURN_PENDING','ARCHIVE','CANCEL','DELETE'));

create or replace view public.accounts_receivable_history with(security_invoker=true) as
select i.*,greatest(i.amount-i.paid_amount,0)::numeric(14,2) outstanding_balance,
  case when i.financial_record_state<>'ACTIVE' then i.financial_record_state when i.paid_amount=i.amount and i.amount>0 then 'PAID' when i.paid_amount>0 then 'PARTIALLY_PAID' when i.status='DRAFT' then 'DRAFT' when i.due_date<current_date then 'OVERDUE' else 'PENDING' end effective_status,
  case when i.due_date is null then null else i.due_date-current_date end days_remaining,
  case when i.due_date is null or i.due_date>=current_date or i.amount=i.paid_amount then 'CURRENT' when current_date-i.due_date<=15 then '15' when current_date-i.due_date<=30 then '30' when current_date-i.due_date<=60 then '60' else '90+' end aging_bucket,
  coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'paidAt',p.paid_at,'method',p.method,'reason',p.reason,'type',p.movement_type,'receiptPath',p.receipt_path) order by p.paid_at desc,p.created_at desc) from invoice_payments p where p.invoice_id=i.id),'[]'::jsonb) payment_history
from public.invoices i;

drop view if exists public.accounts_receivable_projection;
create view public.accounts_receivable_projection with(security_invoker=true) as
select * from public.accounts_receivable_history where financial_record_state='ACTIVE' and record_origin='PRODUCTION' and deleted_at is null;
grant select on public.accounts_receivable_projection to authenticated;

create or replace function public.enforce_active_financial_record() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from invoices i where i.project_id=new.project_id)
    and not exists(select 1 from invoices i where i.project_id=new.project_id and i.financial_record_state='ACTIVE' and i.record_origin='PRODUCTION' and i.deleted_at is null and i.status<>'CANCELLED') then
    new.status:='CANCELLED';new.revenue:=0;new.estimated_cost:=0;new.real_cost:=0;new.personnel_cost:=0;new.operational_resources_cost:=0;new.total_operational_cost:=0;new.gross_profit:=0;new.gross_margin:=0;new.net_profit:=0;new.net_margin:=0;new.invoiced_amount:=0;new.paid_amount:=0;new.outstanding_balance:=0;
    new.traceability:=coalesce(new.traceability,'{}')||jsonb_build_object('financialRecordState','INACTIVE','excludedAt',now());
  end if;
  return new;
end $$;
drop trigger if exists enforce_active_financial_record on public.financial_event_records;
create trigger enforce_active_financial_record before insert or update on public.financial_event_records for each row execute function public.enforce_active_financial_record();

create or replace function public.apply_receivable_movement(
  p_invoice_id uuid,p_action text,p_amount numeric,p_occurred_at timestamptz,p_method text,p_receipt_path text,p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();inv invoices%rowtype;action text:=upper(trim(p_action));movement_id uuid;effective numeric:=0;current_paid numeric;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede gestionar pagos.';end if;
  if action not in('DEPOSIT','PARTIAL_PAYMENT','FULL_PAYMENT','RETURN_PENDING','ARCHIVE','CANCEL','DELETE')then raise exception'Acción financiera no válida.';end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception'El motivo es obligatorio.';end if;
  select*into inv from invoices where id=p_invoice_id for update;if not found then raise exception'Cuenta por cobrar no encontrada.';end if;current_paid:=inv.paid_amount;
  if action in('DEPOSIT','PARTIAL_PAYMENT','FULL_PAYMENT')and(inv.financial_record_state<>'ACTIVE'or inv.record_origin<>'PRODUCTION'or inv.deleted_at is not null)then raise exception'La cuenta inactiva no admite pagos.';end if;
  if action in('DEPOSIT','PARTIAL_PAYMENT')then effective:=p_amount;if effective<=0 or current_paid+effective>inv.amount then raise exception'El monto supera el saldo pendiente.';end if;
  elsif action='FULL_PAYMENT'then effective:=inv.amount-current_paid;if effective<=0 then raise exception'La cuenta ya está completamente pagada.';end if;
  elsif action='RETURN_PENDING'then effective:=-current_paid;if current_paid<=0 then raise exception'La cuenta ya se encuentra pendiente.';end if;end if;
  insert into receivable_movements(invoice_id,movement_type,amount,effective_amount,occurred_at,method,receipt_path,reason,actor_id,metadata)
  values(inv.id,action,abs(effective),effective,coalesce(p_occurred_at,now()),nullif(p_method,''),nullif(p_receipt_path,''),trim(p_reason),actor,jsonb_build_object('previousPaid',current_paid,'saleTotal',inv.amount,'previousStatus',inv.status,'previousRecordState',inv.financial_record_state))returning id into movement_id;
  if effective<>0 then
    insert into invoice_payments(invoice_id,amount,paid_at,method,reference,reason,created_by,movement_type,receipt_path)values(inv.id,effective,coalesce(p_occurred_at,now()),coalesce(nullif(p_method,''),case when effective<0 then'REVERSAL'else'OTHER'end),movement_id::text,trim(p_reason),actor,action,nullif(p_receipt_path,''));
    update invoices set paid_amount=greatest(0,least(amount,current_paid+effective)),status=case when current_paid+effective>=amount then'PAID'when current_paid+effective>0 then'PARTIALLY_PAID'else'PENDING'end,financial_record_state='ACTIVE',cancelled_at=null,closed_at=case when current_paid+effective>=amount then now()else null end,approval_reason=trim(p_reason),updated_by=actor where id=inv.id;
  elsif action='ARCHIVE'then update invoices set financial_record_state='ARCHIVED',archived_at=now(),archived_by=actor,status='CANCELLED',cancelled_at=now(),approval_reason=trim(p_reason),updated_by=actor where id=inv.id;
  elsif action='CANCEL'then update invoices set financial_record_state='CANCELLED',status='CANCELLED',cancelled_at=now(),approval_reason=trim(p_reason),updated_by=actor where id=inv.id;
  elsif action='DELETE'then update invoices set financial_record_state='DELETED',status='CANCELLED',deleted_at=coalesce(deleted_at,now()),deleted_by=actor,approval_reason=trim(p_reason),updated_by=actor where id=inv.id;end if;
  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(inv.customer_id,inv.project_id,inv.orbit_event_id,'RECEIVABLE_'||action,'Movimiento financiero: '||replace(action,'_',' '),trim(p_reason),actor,'Founder','Administrator','RECEIVABLE_'||action,'Invoice',inv.id,case when effective<>0 then'Movimiento financiero por '||to_char(effective,'FM$999G999G999')||'.'else trim(p_reason)end,'receivable-movement:'||movement_id,trim(p_reason),actor);
  perform sync_financial_event(inv.project_id);return movement_id;
end$$;

create table if not exists public.financial_integrity_issues(id uuid primary key default gen_random_uuid(),invoice_id uuid references public.invoices(id)on delete cascade,issue_type text not null,details jsonb not null default'{}',status text not null default'OPEN'check(status in('OPEN','REPAIRED','IGNORED')),detected_at timestamptz not null default now(),repaired_at timestamptz,unique(invoice_id,issue_type));
alter table public.financial_integrity_issues enable row level security;
drop policy if exists financial_integrity_founder_read on public.financial_integrity_issues;
create policy financial_integrity_founder_read on public.financial_integrity_issues for select using(public.can_administer());

create or replace function public.audit_receivable_integrity()returns jsonb language plpgsql security definer set search_path=public as $$
declare qa integer;duplicates integer;broken integer;
begin if auth.uid()is null or not public.can_administer()then raise exception'Solo Founder puede auditar cuentas.';end if;
  insert into financial_integrity_issues(invoice_id,issue_type,details)select i.id,'QA_RECEIVABLE',jsonb_build_object('customer',c.full_name,'projectId',i.project_id)from invoices i join customers c on c.id=i.customer_id where i.record_origin='QA' on conflict(invoice_id,issue_type)do update set details=excluded.details,status='OPEN',detected_at=now();get diagnostics qa=row_count;
  insert into financial_integrity_issues(invoice_id,issue_type,details)select id,'DUPLICATE_RECEIVABLE',jsonb_build_object('projectId',project_id,'rank',rn)from(select i.id,i.project_id,row_number()over(partition by project_id order by created_at desc)rn from invoices i where financial_record_state='ACTIVE'and record_origin='PRODUCTION'and deleted_at is null)x where rn>1 on conflict(invoice_id,issue_type)do update set details=excluded.details,status='OPEN',detected_at=now();get diagnostics duplicates=row_count;
  select count(*)into broken from invoices i left join projects p on p.id=i.project_id left join customers c on c.id=i.customer_id where p.id is null or c.id is null;
  return jsonb_build_object('qa',qa,'duplicates',duplicates,'broken',broken,'total',qa+duplicates+broken);
end $$;

create or replace function public.cleanup_receivable_integrity(p_reason text)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();affected integer:=0;r record;
begin if actor is null or not public.can_administer()then raise exception'Solo Founder puede ejecutar la limpieza.';end if;if length(trim(coalesce(p_reason,'')))<3 then raise exception'Motivo obligatorio.';end if;
  for r in select distinct i.* from invoices i join financial_integrity_issues f on f.invoice_id=i.id and f.status='OPEN' where f.issue_type in('QA_RECEIVABLE','DUPLICATE_RECEIVABLE')loop
    update invoices set financial_record_state='ARCHIVED',record_origin=case when r.record_origin='QA'then'QA'else record_origin end,status='CANCELLED',archived_at=now(),archived_by=actor,approval_reason=p_reason,updated_by=actor where id=r.id;
    update financial_integrity_issues set status='REPAIRED',repaired_at=now()where invoice_id=r.id and status='OPEN';perform sync_financial_event(r.project_id);affected:=affected+1;
  end loop;return jsonb_build_object('affected',affected);end $$;

revoke all on function public.audit_receivable_integrity()from public,anon;grant execute on function public.audit_receivable_integrity()to authenticated;
revoke all on function public.cleanup_receivable_integrity(text)from public,anon;grant execute on function public.cleanup_receivable_integrity(text)to authenticated;

-- Rebuild the truth immediately so pre-existing inactive and QA rows stop contributing.
select public.sync_financial_event(project_id)from(select distinct project_id from invoices where financial_record_state<>'ACTIVE'or record_origin='QA')x;

commit;

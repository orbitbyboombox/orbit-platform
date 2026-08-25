begin;

-- The commercial Event owns payment conditions. This function materializes
-- those terms on the one active production receivable without touching the
-- payment ledger or changing the accepted sale amount.
create or replace function public.sync_project_receivable_terms(p_project_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  p public.projects%rowtype;
  inv public.invoices%rowtype;
  condition text;
  term_days integer;
  invoice_term text;
begin
  select * into p from public.projects where id=p_project_id;
  if not found or p.deleted_at is not null or upper(p.status) in ('CANCELLED','CANCELED','ARCHIVED') then return null; end if;

  condition:=upper(coalesce(p.finance->>'paymentCondition',''));
  term_days:=greatest(0,coalesce(nullif(p.finance->>'paymentTermDays','')::integer,0));
  if condition='CORPORATE_CREDIT' and term_days<=0 then
    raise exception 'El crédito Empresa requiere un plazo positivo en días.';
  end if;

  select * into inv
  from public.invoices i
  where i.project_id=p.id and i.financial_record_state='ACTIVE'
    and i.record_origin='PRODUCTION' and i.deleted_at is null
    and i.status not in('CANCELLED','DRAFT')
  order by case when i.invoice_number like 'ORBIT-%' then 0 else 1 end,i.created_at
  limit 1 for update;
  if not found then
    perform public.sync_financial_event(p.id);
    select * into inv
    from public.invoices i
    where i.project_id=p.id and i.financial_record_state='ACTIVE'
      and i.record_origin='PRODUCTION' and i.deleted_at is null
      and i.status not in('CANCELLED','DRAFT')
    order by case when i.invoice_number like 'ORBIT-%' then 0 else 1 end,i.created_at
    limit 1 for update;
  end if;
  if not found then return null; end if;

  invoice_term:=case term_days
    when 15 then 'DAYS_15' when 30 then 'DAYS_30' when 45 then 'DAYS_45'
    when 60 then 'DAYS_60' when 90 then 'DAYS_90'
    else case when term_days>0 then 'CUSTOM' else 'CASH' end end;

  update public.invoices
  set customer_type=case when condition='CORPORATE_CREDIT' then 'CORPORATE' else customer_type end,
      payment_term=case when condition='CORPORATE_CREDIT' then invoice_term else 'CASH' end,
      custom_term_days=case when condition='CORPORATE_CREDIT' and invoice_term='CUSTOM' then term_days else null end,
      issue_date=coalesce(issue_date,current_date),
      notes=case when coalesce(notes,'') like '%Condición sincronizada desde Evento%' then notes
        else concat_ws(' · ',nullif(notes,''),'Condición sincronizada desde Evento') end,
      updated_by=coalesce(auth.uid(),updated_by)
  where id=inv.id and (
    customer_type is distinct from case when condition='CORPORATE_CREDIT' then 'CORPORATE' else customer_type end
    or payment_term is distinct from case when condition='CORPORATE_CREDIT' then invoice_term else 'CASH' end
    or custom_term_days is distinct from case when condition='CORPORATE_CREDIT' and invoice_term='CUSTOM' then term_days else null end
    or issue_date is null or coalesce(notes,'') not like '%Condición sincronizada desde Evento%'
  );

  perform public.sync_financial_event(p.id);
  return inv.id;
end $$;

create or replace function public.project_receivable_terms_changed()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.finance is distinct from old.finance then
    perform public.sync_project_receivable_terms(new.id);
  end if;
  return new;
end $$;

drop trigger if exists zz_project_receivable_terms_changed on public.projects;
create trigger zz_project_receivable_terms_changed after update of finance on public.projects
for each row execute function public.project_receivable_terms_changed();

-- At most one live receivable per Event. Draft/formalization history remains
-- available, but cannot enter Accounts Receivable or collection universes.
create unique index if not exists invoices_one_active_receivable_per_project_uq
on public.invoices(project_id)
where financial_record_state='ACTIVE' and record_origin='PRODUCTION'
  and deleted_at is null and status not in('DRAFT','CANCELLED');

-- Deterministic CCU repair authorized by the production incident. No amount,
-- paid_amount, invoice_payment or ledger movement is changed.
update public.projects
set finance=jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(finance,'{}'::jsonb),'{paymentCondition}','"CORPORATE_CREDIT"'::jsonb,true),
        '{paymentTermDays}','30'::jsonb,true),
      '{corporateCreditApproved}','true'::jsonb,true),
    operations=jsonb_set(coalesce(operations,'{}'::jsonb),'{paymentClause}','"Pago a 30 días desde la emisión de la factura."'::jsonb,true),
    updated_at=now()
where id='893634d4-c550-4821-b35a-0f33873c2576'
  and deleted_at is null
  and exists(
    select 1 from public.quotations q
    where q.id='4d7bda0a-b6df-4641-afe2-d29e8e5a19af'
      and q.project_id=projects.id and q.quotation_number='2026-826'
      and coalesce(q.final_customer_price,q.grand_total)=345100
  )
  and exists(
    select 1 from public.invoices i where i.project_id=projects.id
      and i.financial_record_state='ACTIVE' and i.record_origin='PRODUCTION'
      and i.deleted_at is null and i.amount=345100 and i.paid_amount=0
  );

-- Retain the parallel draft as archived audit history; never delete it.
update public.invoices
set financial_record_state='ARCHIVED',status='CANCELLED',archived_at=coalesce(archived_at,now()),
    cancelled_at=coalesce(cancelled_at,now()),approval_reason='Receivable paralelo archivado por unificación Empresa',
    updated_by=coalesce(auth.uid(),updated_by)
where project_id='893634d4-c550-4821-b35a-0f33873c2576'
  and invoice_number='FAC-2026-893634D4' and status='DRAFT'
  and financial_record_state='ACTIVE' and deleted_at is null and paid_amount=0
  and not exists(select 1 from public.invoice_payments ip where ip.invoice_id=invoices.id and ip.deleted_at is null);

select public.sync_project_receivable_terms('893634d4-c550-4821-b35a-0f33873c2576');

-- Repair already explicit positive Empresa terms. BRYSA is deliberately
-- excluded from this data rewrite by Founder order; the systemic rule remains.
do $$ declare item record; begin
  for item in
    select p.id
    from public.projects p
    where p.deleted_at is null and upper(p.status) not in('CANCELLED','CANCELED','ARCHIVED')
      and p.id<>'14505348-e3c9-41f8-942a-381a7d7f9d9f'
      and upper(coalesce(p.finance->>'paymentCondition',''))='CORPORATE_CREDIT'
      and coalesce(nullif(p.finance->>'paymentTermDays','')::integer,0)>0
  loop perform public.sync_project_receivable_terms(item.id); end loop;
end $$;

create or replace view public.empresa_credit_integrity_projection with(security_invoker=true) as
select p.id project_id,p.orbit_event_id,p.customer_id,c.full_name customer_name,c.company,
  (p.finance->>'paymentTermDays')::integer payment_term_days,
  i.id invoice_id,i.invoice_number,i.issue_date,i.due_date,i.amount,i.paid_amount,
  greatest(i.amount-i.paid_amount,0)::numeric(14,2) outstanding_balance,
  i.payment_term,
  true in_accounts_receivable,
  true in_company_credit,
  true in_collection_center,
  coalesce((select cs.status from public.calendar_sync cs where cs.project_id=p.id order by cs.updated_at desc limit 1),'MISSING') calendar_status,
  coalesce((select ds.status from public.drive_sync ds where ds.project_id=p.id and ds.external_folder_id is not null order by ds.last_synced_at desc nulls last limit 1),'MISSING') drive_status
from public.projects p
join public.customers c on c.id=p.customer_id and c.deleted_at is null
join public.accounts_receivable_projection i on i.project_id=p.id
where p.deleted_at is null and upper(p.status) not in('CANCELLED','CANCELED','ARCHIVED')
  and upper(coalesce(p.finance->>'paymentCondition',''))='CORPORATE_CREDIT'
  and coalesce(nullif(p.finance->>'paymentTermDays','')::integer,0)>0
  and i.amount-i.paid_amount>0;

grant select on public.empresa_credit_integrity_projection to authenticated;
revoke all on function public.sync_project_receivable_terms(uuid),public.project_receivable_terms_changed() from public,anon;
grant execute on function public.sync_project_receivable_terms(uuid) to authenticated,service_role;

commit;

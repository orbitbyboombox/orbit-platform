begin;

-- A receivable due date must retain its business origin. In particular, a
-- Wedding balance follows the Event date unless Founder explicitly records a
-- negotiated date. This keeps operational edits deterministic without
-- guessing from notes, customer names, or historical creation dates.
alter table public.invoices
  add column if not exists due_date_source text not null default 'ISSUE_TERM'
  check (due_date_source in ('ISSUE_TERM','EVENT_DATE','EXPLICIT'));

comment on column public.invoices.due_date_source is
  'Canonical origin of due_date: invoice term, Wedding Event date, or explicit Founder agreement.';

create or replace function public.prepare_invoice()
returns trigger language plpgsql set search_path=public as $$
declare event_kind text; wedding_date date;
begin
  if new.payment_term='CUSTOM' and new.custom_term_days is null then
    raise exception 'Los días personalizados son obligatorios.';
  end if;
  if new.status<>'DRAFT' and new.issue_date is null then new.issue_date=current_date; end if;

  select upper(coalesce(p.project_type,'')),p.event_date
    into event_kind,wedding_date
  from public.projects p where p.id=new.project_id;

  if event_kind='WEDDING' and new.due_date_source<>'EXPLICIT' then
    if wedding_date is null then raise exception 'El Matrimonio requiere fecha de Evento para definir el vencimiento.'; end if;
    new.due_date=wedding_date;
    new.due_date_source='EVENT_DATE';
  elsif new.due_date_source<>'EXPLICIT' and new.issue_date is not null and (
    tg_op='INSERT'
    or new.issue_date is distinct from old.issue_date
    or new.payment_term is distinct from old.payment_term
    or new.custom_term_days is distinct from old.custom_term_days
    or new.due_date is not distinct from old.due_date
    or new.due_date_source is distinct from old.due_date_source
  ) then
    new.due_date=new.issue_date+public.invoice_term_days(new.payment_term,new.custom_term_days);
    new.due_date_source='ISSUE_TERM';
  end if;

  if new.paid_amount=new.amount and new.amount>0 then
    new.status='PAID'; new.closed_at=coalesce(new.closed_at,now());
  elsif new.paid_amount>0 and new.status<>'CANCELLED' then new.status='PARTIALLY_PAID';
  elsif new.status not in ('DRAFT','CANCELLED') then
    new.status=case when new.due_date<current_date then 'OVERDUE' else 'PENDING' end;
  end if;
  return new;
end $$;

create or replace function public.sync_project_receivable_terms(p_project_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  p public.projects%rowtype;
  inv public.invoices%rowtype;
  condition text;
  term_days integer;
  invoice_term text;
  wedding boolean;
begin
  select * into p from public.projects where id=p_project_id;
  if not found or p.deleted_at is not null or upper(p.status) in ('CANCELLED','CANCELED','ARCHIVED') then return null; end if;

  condition:=upper(coalesce(p.finance->>'paymentCondition',''));
  term_days:=greatest(0,coalesce(nullif(p.finance->>'paymentTermDays','')::integer,0));
  wedding:=upper(coalesce(p.project_type,''))='WEDDING';
  if condition='CORPORATE_CREDIT' and term_days<=0 then
    raise exception 'El crédito Empresa requiere un plazo positivo en días.';
  end if;
  if wedding and p.event_date is null then
    raise exception 'El Matrimonio requiere fecha de Evento para definir el vencimiento.';
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

  if wedding then
    update public.invoices set
      payment_term='CASH',custom_term_days=null,
      due_date=case when due_date_source='EXPLICIT' then due_date else p.event_date end,
      due_date_source=case when due_date_source='EXPLICIT' then 'EXPLICIT' else 'EVENT_DATE' end,
      updated_by=coalesce(auth.uid(),updated_by)
    where id=inv.id;
  else
    update public.invoices set
      customer_type=case when condition='CORPORATE_CREDIT' then 'CORPORATE' else customer_type end,
      payment_term=case when condition='CORPORATE_CREDIT' then invoice_term else payment_term end,
      custom_term_days=case when condition='CORPORATE_CREDIT' and invoice_term='CUSTOM' then term_days
        when condition='CORPORATE_CREDIT' then null else custom_term_days end,
      issue_date=coalesce(issue_date,current_date),
      due_date_source=case when due_date_source='EXPLICIT' then 'EXPLICIT' else 'ISSUE_TERM' end,
      notes=case when condition<>'CORPORATE_CREDIT' or coalesce(notes,'') like '%Condición sincronizada desde Evento%' then notes
        else concat_ws(' · ',nullif(notes,''),'Condición sincronizada desde Evento') end,
      updated_by=coalesce(auth.uid(),updated_by)
    where id=inv.id;
  end if;

  perform public.sync_financial_event(p.id);
  return inv.id;
end $$;

create or replace function public.project_receivable_terms_changed()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.finance is distinct from old.finance
    or new.event_date is distinct from old.event_date
    or new.project_type is distinct from old.project_type then
    perform public.sync_project_receivable_terms(new.id);
  end if;
  return new;
end $$;

drop trigger if exists zz_project_receivable_terms_changed on public.projects;
create trigger zz_project_receivable_terms_changed
after update of finance,event_date,project_type on public.projects
for each row execute function public.project_receivable_terms_changed();

create or replace function public.update_receivable_dates(
  p_invoice_id uuid,p_payment_id uuid,p_payment_date date,p_due_date date,p_reason text
) returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); inv invoices%rowtype; movement uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede editar fechas financieras.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo es obligatorio.'; end if;
  select * into inv from invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Cuenta por cobrar no encontrada.'; end if;
  if p_payment_id is not null then
    if p_payment_date is null then raise exception 'La fecha de pago es obligatoria.'; end if;
    select nullif(reference,'')::uuid into movement from invoice_payments where id=p_payment_id and invoice_id=p_invoice_id;
    if not found then raise exception 'Movimiento de pago no encontrado.'; end if;
    update invoice_payments set paid_at=p_payment_date::timestamptz where id=p_payment_id;
    if movement is not null then update receivable_movements set occurred_at=p_payment_date::timestamptz,metadata=metadata||jsonb_build_object('dateEditReason',trim(p_reason),'dateEditedBy',actor,'dateEditedAt',now()) where id=movement; end if;
  elsif p_due_date is not null then
    update invoices set due_date=p_due_date,due_date_source='EXPLICIT',approval_reason=trim(p_reason),updated_by=actor where id=p_invoice_id;
  else raise exception 'Debes indicar una fecha.';
  end if;
  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(inv.customer_id,inv.project_id,inv.orbit_event_id,'RECEIVABLE_DATE_UPDATED','Fecha financiera actualizada',trim(p_reason),actor,'Founder','Administrator','RECEIVABLE_DATE_UPDATED','Invoice',inv.id,'Se actualizó una fecha financiera desde el Perfil del Cliente.','receivable-date:'||gen_random_uuid(),trim(p_reason),actor);
  perform public.sync_financial_event(inv.project_id);
  perform public.sync_event_profitability(inv.project_id);
end $$;

-- Reconcile every active Production Wedding through the same canonical rule.
-- Amounts, accepted quotations, invoice_payments and receipt documents are not
-- written by this migration.
update public.invoices i set
  due_date=p.event_date,
  due_date_source='EVENT_DATE',
  updated_at=now()
from public.projects p
where p.id=i.project_id and upper(coalesce(p.project_type,''))='WEDDING'
  and p.event_date is not null and p.deleted_at is null
  and upper(p.status) not in('CANCELLED','CANCELED','ARCHIVED')
  and i.financial_record_state='ACTIVE' and i.record_origin='PRODUCTION'
  and i.deleted_at is null and i.status not in('DRAFT','CANCELLED','PAID')
  and i.due_date_source<>'EXPLICIT';

do $$ declare item record; begin
  for item in
    select distinct i.project_id from public.invoices i
    join public.projects p on p.id=i.project_id
    where upper(coalesce(p.project_type,''))='WEDDING'
      and p.deleted_at is null and upper(p.status) not in('CANCELLED','CANCELED','ARCHIVED')
      and i.financial_record_state='ACTIVE' and i.record_origin='PRODUCTION'
      and i.deleted_at is null and i.status not in('DRAFT','CANCELLED')
  loop perform public.sync_financial_event(item.project_id); end loop;
end $$;

revoke all on function public.sync_project_receivable_terms(uuid),public.project_receivable_terms_changed() from public,anon;
grant execute on function public.sync_project_receivable_terms(uuid) to authenticated,service_role;

commit;

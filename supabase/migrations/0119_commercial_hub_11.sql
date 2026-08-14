begin;

create table if not exists public.commercial_quote_sequences (
  quote_year integer primary key check (quote_year between 2020 and 2200),
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.next_commercial_quote_number(p_issue_date date default current_date)
returns text language plpgsql security definer set search_path=public as $$
declare y integer:=extract(year from p_issue_date); n bigint;
begin
  insert into commercial_quote_sequences(quote_year,last_value) values(y,1)
  on conflict(quote_year) do update set last_value=commercial_quote_sequences.last_value+1,updated_at=now()
  returning last_value into n;
  return format('COTIZACIÓN %s-%s',y,lpad(n::text,6,'0'));
end $$;
revoke all on function public.next_commercial_quote_number(date) from public,anon,authenticated;
grant execute on function public.next_commercial_quote_number(date) to authenticated,service_role;

alter table public.quotations alter column customer_id drop not null;
alter table public.quotations alter column project_id drop not null;
alter table public.quotations alter column orbit_event_id drop not null;
alter table public.quotations add column if not exists customer_snapshot jsonb not null default '{}'::jsonb;
alter table public.quotations add column if not exists commercial_snapshot jsonb not null default '{}'::jsonb;
alter table public.quotations add column if not exists validity_days integer not null default 10 check(validity_days between 1 and 365);
alter table public.quotations add column if not exists deposit_percent numeric(5,2) not null default 50 check(deposit_percent between 0 and 100);
alter table public.quotations add column if not exists global_discount_type text check(global_discount_type in ('CLP','PERCENT'));
alter table public.quotations add column if not exists global_discount_value numeric(14,2) not null default 0 check(global_discount_value>=0);
alter table public.quotations add column if not exists viewed_at timestamptz;
alter table public.quotations add column if not exists converted_at timestamptz;
alter table public.quotations add column if not exists cancelled_at timestamptz;
alter table public.quotations add column if not exists cancelled_reason text;
alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations add constraint quotations_status_check check(status in ('DRAFT','SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED','CONVERTED','CANCELLED'));
create unique index if not exists quotations_professional_number_uidx on public.quotations(quotation_number);

alter table public.quotation_items add column if not exists description text;
alter table public.quotation_items add column if not exists catalog_price numeric(14,2);
alter table public.quotation_items add column if not exists quoted_price numeric(14,2);
alter table public.quotation_items add column if not exists discount_type text check(discount_type in ('CLP','PERCENT'));
alter table public.quotation_items add column if not exists discount_value numeric(14,2) not null default 0 check(discount_value>=0);
alter table public.quotation_items add column if not exists display_order integer not null default 0;
alter table public.quotation_items add column if not exists is_manual boolean not null default false;

create or replace function public.update_commercial_quote_draft(p_quotation_id uuid,p_quote jsonb,p_items jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); item jsonb;
begin
  if actor is null or not exists(select 1 from profiles where id=actor and role in('CEO','ADMINISTRATOR','SALES')) then raise exception 'Acceso comercial requerido.'; end if;
  perform 1 from quotations where id=p_quotation_id and status='DRAFT' for update;
  if not found then raise exception 'La cotización ya no es un borrador editable.'; end if;
  update quotations set customer_id=nullif(p_quote->>'customerId','')::uuid,customer_snapshot=p_quote->'customerSnapshot',commercial_snapshot=p_quote->'commercialSnapshot',pricing_snapshot=p_quote->'commercialSnapshot',expiration_date=(p_quote->>'expirationDate')::date,subtotal=(p_quote->>'subtotal')::numeric,discount_total=(p_quote->>'discountTotal')::numeric,tax_total=(p_quote->>'taxTotal')::numeric,grand_total=(p_quote->>'grandTotal')::numeric,official_price=(p_quote->>'grandTotal')::numeric,final_customer_price=(p_quote->>'grandTotal')::numeric,validity_days=(p_quote->>'validityDays')::integer,deposit_percent=(p_quote->>'depositPercent')::numeric,global_discount_type=nullif(p_quote->>'globalDiscountType',''),global_discount_value=(p_quote->>'globalDiscountValue')::numeric,updated_by=actor,updated_at=now() where id=p_quotation_id;
  delete from quotation_items where quotation_id=p_quotation_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into quotation_items(quotation_id,item_type,code,label,description,quantity,unit_price,total,official_unit_price,official_total,final_unit_price,final_total,catalog_price,quoted_price,discount_type,discount_value,display_order,is_manual,metadata)
    values(p_quotation_id,item->>'itemType',item->>'code',item->>'description',item->>'description',(item->>'quantity')::numeric,(item->>'quotedPrice')::numeric,(item->>'total')::numeric,coalesce((item->>'catalogPrice')::numeric,(item->>'quotedPrice')::numeric),coalesce((item->>'catalogPrice')::numeric,(item->>'quotedPrice')::numeric)*(item->>'quantity')::numeric,(item->>'quotedPrice')::numeric,(item->>'total')::numeric,(item->>'catalogPrice')::numeric,(item->>'quotedPrice')::numeric,nullif(item->>'discountType',''),(item->>'discountValue')::numeric,(item->>'displayOrder')::integer,(item->>'manual')::boolean,coalesce(item->'metadata','{}'::jsonb));
  end loop;
end $$;
revoke all on function public.update_commercial_quote_draft(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.update_commercial_quote_draft(uuid,jsonb,jsonb) to authenticated;

create table if not exists public.commercial_email_templates (
  id uuid primary key default gen_random_uuid(), category text not null check(category in ('WEDDINGS','BIRTHDAYS','GRADUATIONS','COMPANIES_CATALOG','COMPANIES_QUOTE')),
  subject text not null, body text not null, active boolean not null default true, version integer not null default 1,
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(category,version)
);
alter table public.commercial_email_templates add column if not exists default_subject text;
alter table public.commercial_email_templates add column if not exists default_body text;
create unique index if not exists commercial_email_templates_active_uidx on public.commercial_email_templates(category) where active;

create table if not exists public.commercial_documents (
  id uuid primary key default gen_random_uuid(), name text not null, category text not null check(category in ('WEDDINGS','COMPANIES','EVENTS')),
  version text not null, filename text not null, storage_bucket text not null default 'orbit-documents', storage_path text not null unique,
  status text not null default 'PENDING' check(status in ('PENDING','ACTIVE','ARCHIVED')), uploaded_by uuid references auth.users(id), uploaded_at timestamptz not null default now(), archived_at timestamptz
);
create unique index if not exists commercial_documents_active_uidx on public.commercial_documents(category) where status='ACTIVE';

create or replace function public.activate_commercial_document(p_document_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare target_category text;
begin
  select category into target_category from commercial_documents where id=p_document_id for update;
  if target_category is null then raise exception 'Documento comercial no encontrado.'; end if;
  update commercial_documents set status='ARCHIVED',archived_at=now() where category=target_category and status='ACTIVE' and id<>p_document_id;
  update commercial_documents set status='ACTIVE',archived_at=null where id=p_document_id;
end $$;
revoke all on function public.activate_commercial_document(uuid) from public,anon;
grant execute on function public.activate_commercial_document(uuid) to authenticated;

create table if not exists public.commercial_sends (
  id uuid primary key default gen_random_uuid(), recipient_email text not null, recipient_name text, category text not null,
  template_id uuid references public.commercial_email_templates(id), document_id uuid references public.commercial_documents(id), quotation_id uuid references public.quotations(id),
  subject text not null, body_snapshot text not null, document_snapshot jsonb, status text not null default 'PREPARING' check(status in ('PREPARING','SENT','FAILED')),
  external_message_id text, sent_by uuid references auth.users(id), sent_at timestamptz not null default now()
);
alter table public.commercial_sends add column if not exists idempotency_key uuid;
create unique index if not exists commercial_sends_idempotency_uidx on public.commercial_sends(idempotency_key) where idempotency_key is not null;
create index if not exists commercial_sends_recipient_idx on public.commercial_sends(recipient_email,sent_at desc);
create index if not exists commercial_sends_quote_idx on public.commercial_sends(quotation_id,sent_at desc);

alter table public.finance_recurring_expense_rules add column if not exists currency text not null default 'CLP';
alter table public.finance_recurring_expense_rules drop constraint if exists finance_recurring_expense_rules_currency_check;
alter table public.finance_recurring_expense_rules add constraint finance_recurring_expense_rules_currency_check check(currency in ('CLP','USD'));
alter table public.finance_recurring_expense_rules add column if not exists provider text;
alter table public.finance_recurring_expense_rules add column if not exists metadata jsonb not null default '{}'::jsonb;
insert into public.finance_recurring_expense_rules(name,provider,category,amount,currency,frequency,due_day,next_due_date,active,metadata)
values
('Supabase Pro','Supabase','TECHNOLOGY_SOFTWARE',20,'USD','MONTHLY',1,date_trunc('month',current_date)::date,true,'{"source":"COMMERCIAL_HUB_1_1"}'),
('Vercel Pro','Vercel','TECHNOLOGY_SOFTWARE',49,'USD','MONTHLY',1,date_trunc('month',current_date)::date,true,'{"source":"COMMERCIAL_HUB_1_1"}'),
('ChatGPT / OpenAI','ChatGPT / OpenAI','TECHNOLOGY_SOFTWARE',110,'USD','MONTHLY',1,date_trunc('month',current_date)::date,true,'{"source":"COMMERCIAL_HUB_1_1"}')
on conflict do nothing;

update public.company_settings
set pdf_configuration=jsonb_set(
  coalesce(pdf_configuration,'{}'::jsonb),
  '{commercialBank}',
  '{"bankName":"BCI","accountType":"Cuenta Corriente","accountNumber":"52093409","email":"contabilidad@bbox.cl"}'::jsonb,
  true
)
where settings_key='PRIMARY' and not (coalesce(pdf_configuration,'{}'::jsonb) ? 'commercialBank');

-- USD rules remain in their original currency until an audited FX rate exists.
-- This prevents a USD amount from being silently posted as CLP.
create or replace function public.generate_recurring_finance_expenses(p_as_of date default current_date)
returns integer language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); item record; expense_id uuid; generated integer:=0; period_start date;
begin
  if actor is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  for item in select * from finance_recurring_expense_rules where active and currency='CLP' and next_due_date<=p_as_of loop
    period_start:=date_trunc('month',item.next_due_date)::date;
    if not exists(select 1 from finance_recurring_expense_runs where rule_id=item.id and accounting_month=period_start) then
      insert into expenses(category,supplier,occurred_on,subtotal,vat,total,status,approval_reason,created_by,updated_by)
      values(item.category,item.name,item.next_due_date,item.amount,0,item.amount,'PENDING',jsonb_build_object('recurringRuleId',item.id,'bankAccountId',item.bank_account_id,'canonicalSource','RECURRING_EXPENSE','currency',item.currency)::text,actor,actor)
      returning id into expense_id;
      insert into finance_recurring_expense_runs(rule_id,accounting_month,expense_id) values(item.id,period_start,expense_id);
      generated:=generated+1;
    end if;
    update finance_recurring_expense_rules set next_due_date=case item.frequency when 'MONTHLY' then (item.next_due_date+interval '1 month')::date when 'QUARTERLY' then (item.next_due_date+interval '3 months')::date else (item.next_due_date+interval '1 year')::date end,updated_by=actor,updated_at=now() where id=item.id;
  end loop;
  return generated;
end$$;

alter table public.commercial_quote_sequences enable row level security;
alter table public.commercial_email_templates enable row level security;
alter table public.commercial_documents enable row level security;
alter table public.commercial_sends enable row level security;
do $$ begin
  create policy commercial_templates_founder on public.commercial_email_templates for all to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and role in ('CEO','ADMINISTRATOR','SALES'))) with check(exists(select 1 from public.profiles where id=auth.uid() and role in ('CEO','ADMINISTRATOR','SALES')));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy commercial_documents_founder on public.commercial_documents for all to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and role in ('CEO','ADMINISTRATOR','SALES'))) with check(exists(select 1 from public.profiles where id=auth.uid() and role in ('CEO','ADMINISTRATOR','SALES')));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy commercial_sends_founder on public.commercial_sends for all to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and role in ('CEO','ADMINISTRATOR','SALES'))) with check(exists(select 1 from public.profiles where id=auth.uid() and role in ('CEO','ADMINISTRATOR','SALES')));
exception when duplicate_object then null; end $$;

insert into public.commercial_email_templates(category,subject,body,active,version)
values
('WEDDINGS','Información BOOMBOX 2026–2027','Hola [Nombre],\n\nGracias por considerar a BOOMBOX para ser parte de tu celebración.\n\nDesde hace 16 años creamos experiencias fotográficas para matrimonios, cumpleaños, graduaciones y eventos en Chile, combinando fotografía, diseño y entretención para transformar cada momento en un recuerdo.\n\nTe adjuntamos nuestro catálogo BOOMBOX 2026–2027, donde podrás conocer nuestras experiencias y alternativas disponibles.\n\nSi nos compartes la fecha y lugar de tu evento, podemos ayudarte a elegir la opción que mejor se adapte a tu celebración y confirmar disponibilidad.\n\nTu evento pasa una vez. Hagamos que se recuerde.\n\nUn abrazo,\n\nEquipo BOOMBOX',true,1),
('BIRTHDAYS','Información BOOMBOX 2026–2027','Hola [Nombre],\n\nGracias por considerar a BOOMBOX para ser parte de tu celebración.\n\nDesde hace 16 años creamos experiencias fotográficas para matrimonios, cumpleaños, graduaciones y eventos en Chile, combinando fotografía, diseño y entretención para transformar cada momento en un recuerdo.\n\nTe adjuntamos nuestro catálogo BOOMBOX 2026–2027.\n\nEquipo BOOMBOX',true,1),
('GRADUATIONS','Información BOOMBOX 2026–2027','Hola [Nombre],\n\nGracias por considerar a BOOMBOX. Adjuntamos nuestro catálogo de eventos 2026–2027.\n\nEquipo BOOMBOX',true,1),
('COMPANIES_CATALOG','Información corporativa BOOMBOX 2026–2027','Hola [Nombre],\n\nGracias por considerar a BOOMBOX para su próximo evento.\n\nDesde hace 16 años desarrollamos experiencias fotográficas para empresas, marcas, agencias y eventos corporativos, combinando tecnología, personalización y producción para crear activaciones que conectan con las personas.\n\nAdjuntamos la información solicitada para que puedan revisar nuestras alternativas.\n\nSi nos comparten fecha, lugar, cantidad de asistentes y experiencia de interés, podemos preparar una propuesta personalizada para su evento.\n\nQuedamos atentos.\n\nEquipo BOOMBOX',true,1),
('COMPANIES_QUOTE','Cotización BOOMBOX [NumeroCotizacion] — [Empresa]','Hola [Nombre],\n\nAdjuntamos la cotización [NumeroCotizacion] preparada para [Empresa].\n\nQuedamos atentos.\n\nEquipo BOOMBOX',true,1)
on conflict(category,version) do nothing;

update public.commercial_email_templates
set default_subject=coalesce(default_subject,subject),default_body=coalesce(default_body,body)
where default_subject is null or default_body is null;

commit;

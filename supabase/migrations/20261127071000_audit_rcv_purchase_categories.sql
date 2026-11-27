create table public.sii_rcv_purchase_categories (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.sii_rcv_documents(id),
  period date not null check (extract(day from period) = 1),
  category text not null check (category in ('FUEL','SUPPLIES','MAINTENANCE','TRANSPORT','SERVICES','PAYROLL','ADMINISTRATION','OTHER')),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  actor uuid not null,
  recorded_at timestamptz not null default now()
);
create index sii_rcv_purchase_categories_history on public.sii_rcv_purchase_categories(document_id,period,id desc);
alter table public.sii_rcv_purchase_categories enable row level security;
revoke all on public.sii_rcv_purchase_categories from public, anon, authenticated;
grant select, insert on public.sii_rcv_purchase_categories to service_role;
grant usage on sequence public.sii_rcv_purchase_categories_id_seq to service_role;

create function public.sii_rcv_assign_purchase_category(p_company text,p_key text,p_period date,p_category text,p_reason text,p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare candidate uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company || ':' || p_period::text,0));
  if (select action from public.sii_rcv_period_events where company_rut=p_company and period=p_period
    and action in ('CLOSED','REOPENED') order by id desc limit 1) = 'CLOSED' then
    raise exception 'El período está cerrado.';
  end if;
  select distinct d.id into strict candidate from public.sii_rcv_documents d
  join public.sii_rcv_import_observations o on o.document_id=d.id
  join public.sii_rcv_imports i on i.id=o.import_id
  where i.company_rut=p_company and d.company_rut=p_company and i.period=p_period and i.register='Compras' and d.snapshot->>'key'=p_key;
  insert into public.sii_rcv_purchase_categories(document_id,period,category,reason,actor) values(candidate,p_period,p_category,btrim(p_reason),p_actor);
end;
$$;

create function public.sii_rcv_purchase_category_report(p_company text,p_start date,p_end date)
returns table(document_key text,category text)
language sql stable set search_path = '' as $$
  select distinct on (d.id) d.snapshot->>'key',c.category
  from public.sii_rcv_documents d
  join public.sii_rcv_purchase_categories c on c.document_id=d.id
  where d.company_rut=p_company and c.period>=p_start and c.period<p_end and exists (
    select from public.sii_rcv_import_observations o join public.sii_rcv_imports i on i.id=o.import_id
    where o.document_id=d.id and i.company_rut=p_company and i.register='Compras' and i.period>=p_start and i.period<p_end
  )
  order by d.id,c.id desc
$$;
revoke execute on function public.sii_rcv_assign_purchase_category(text,text,date,text,text,uuid), public.sii_rcv_purchase_category_report(text,date,date) from public, anon, authenticated;
grant execute on function public.sii_rcv_assign_purchase_category(text,text,date,text,text,uuid), public.sii_rcv_purchase_category_report(text,date,date) to service_role;

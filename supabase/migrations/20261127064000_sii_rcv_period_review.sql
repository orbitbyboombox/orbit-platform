create table public.sii_rcv_period_events (
  id bigint generated always as identity primary key,
  company_rut text not null,
  period date not null check (extract(day from period) = 1),
  action text not null check (action in ('CLOSED','REOPENED','OWNER_ZERO_FEES')),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  actor uuid not null,
  recorded_at timestamptz not null default now()
);
alter table public.sii_rcv_period_events enable row level security;
revoke all on public.sii_rcv_period_events from public, anon, authenticated;
grant select, insert on public.sii_rcv_period_events to service_role;
grant usage on sequence public.sii_rcv_period_events_id_seq to service_role;

create index sii_rcv_period_events_lookup on public.sii_rcv_period_events(company_rut,period,id desc);

create function public.sii_rcv_guard_closed_period() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.company_rut || ':' || new.period::text, 0));
  if (select action from public.sii_rcv_period_events
      where company_rut = new.company_rut and period = new.period
        and action in ('CLOSED','REOPENED') order by id desc limit 1) = 'CLOSED' then
    raise exception 'El período está cerrado.';
  end if;
  return new;
end;
$$;

create trigger sii_rcv_guard_closed_period before insert on public.sii_rcv_imports
for each row execute function public.sii_rcv_guard_closed_period();

create function public.sii_rcv_record_period_event(p_company text,p_period date,p_action text,p_reason text,p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare prior text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company || ':' || p_period::text,0));
  select action into prior from public.sii_rcv_period_events
    where company_rut = p_company and period = p_period and action in ('CLOSED','REOPENED')
    order by id desc limit 1;
  if p_action = 'CLOSED' and p_period >= date_trunc('month', now() at time zone 'America/Santiago')::date then
    raise exception 'El mes aún está en curso.';
  end if;
  if (p_action = 'CLOSED' and prior = 'CLOSED')
     or (p_action = 'REOPENED' and prior is distinct from 'CLOSED')
     or (p_action = 'OWNER_ZERO_FEES' and (prior = 'CLOSED' or exists (
       select 1 from public.sii_rcv_period_events where company_rut = p_company and period = p_period and action = p_action)))
  then raise exception 'La acción no corresponde al estado actual del período.'; end if;
  insert into public.sii_rcv_period_events(company_rut,period,action,reason,actor)
  values(p_company,p_period,p_action,p_reason,p_actor);
end;
$$;
revoke execute on function public.sii_rcv_record_period_event(text,date,text,text,uuid) from public, anon, authenticated;
grant execute on function public.sii_rcv_record_period_event(text,date,text,text,uuid) to service_role;

create function public.sii_rcv_period_documents(p_company text,p_start date,p_end date)
returns table(register text,snapshot jsonb,has_difference boolean)
language sql stable set search_path = '' as $$
  select distinct on (i.register, d.id)
    i.register, d.snapshot,
    bool_or(o.differs) over (partition by i.register,d.id)
  from public.sii_rcv_import_observations o
  join public.sii_rcv_imports i on i.id = o.import_id
  join public.sii_rcv_documents d on d.id = o.document_id
  where i.company_rut = p_company and d.company_rut = p_company
    and i.period >= p_start and i.period < p_end
  order by i.register,d.id
$$;
revoke execute on function public.sii_rcv_period_documents(text,date,date) from public, anon, authenticated;
grant execute on function public.sii_rcv_period_documents(text,date,date) to service_role;

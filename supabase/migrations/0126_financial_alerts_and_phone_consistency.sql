begin;

create table if not exists public.financial_alert_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  recurrence text not null default 'MONTHLY' check (recurrence = 'MONTHLY'),
  first_notice_day integer not null check (first_notice_day between 1 and 28),
  escalation_day integer not null check (escalation_day between first_notice_day and 28),
  timezone text not null default 'America/Santiago',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.financial_alert_obligations (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.financial_alert_rules(id),
  obligation_key text not null unique,
  accounting_period date not null,
  status text not null default 'PENDING' check (status in ('PENDING','PAID')),
  first_notified_at timestamptz not null default now(),
  escalated_at timestamptz,
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_id, accounting_period)
);

create index if not exists financial_alert_obligations_period_idx
  on public.financial_alert_obligations(accounting_period desc, status);

insert into public.financial_alert_rules(code,name,first_notice_day,escalation_day,timezone,active)
values ('IVA','PAGAR IVA',19,20,'America/Santiago',true)
on conflict(code) do update set name=excluded.name, recurrence='MONTHLY', timezone=excluded.timezone;

alter table public.financial_alert_rules enable row level security;
alter table public.financial_alert_obligations enable row level security;
grant select,insert,update on public.financial_alert_rules to authenticated;
grant select,insert,update on public.financial_alert_obligations to authenticated;
create policy financial_alert_rules_admin on public.financial_alert_rules for all using(public.can_administer()) with check(public.can_administer());
create policy financial_alert_obligations_admin on public.financial_alert_obligations for all using(public.can_administer()) with check(public.can_administer());

drop trigger if exists financial_alert_rules_audit on public.financial_alert_rules;
create trigger financial_alert_rules_audit after insert or update or delete on public.financial_alert_rules for each row execute function public.audit_row_change();
drop trigger if exists financial_alert_obligations_audit on public.financial_alert_obligations;
create trigger financial_alert_obligations_audit after insert or update or delete on public.financial_alert_obligations for each row execute function public.audit_row_change();

create or replace function public.ensure_financial_alerts(p_now timestamptz default now())
returns setof public.financial_alert_obligations
language plpgsql security definer set search_path=public as $$
declare
  rule public.financial_alert_rules%rowtype;
  local_date date;
  period date;
  obligation public.financial_alert_obligations%rowtype;
  alert_title text;
  alert_priority text;
begin
  if not public.can_administer() then raise exception 'Acceso Founder requerido.'; end if;
  for rule in select * from public.financial_alert_rules where active loop
    local_date := (p_now at time zone rule.timezone)::date;
    if extract(day from local_date)::integer < rule.first_notice_day then continue; end if;
    period := date_trunc('month',local_date)::date;
    insert into public.financial_alert_obligations(rule_id,obligation_key,accounting_period,first_notified_at)
    values(rule.id,rule.code||'-'||to_char(period,'YYYY-MM'),period,p_now)
    on conflict(rule_id,accounting_period) do update set updated_at=excluded.updated_at
    returning * into obligation;
    if obligation.status='PAID' then continue; end if;
    if extract(day from local_date)::integer >= rule.escalation_day then
      alert_title := rule.name||' HOY'; alert_priority := 'CRITICAL';
      update public.financial_alert_obligations set escalated_at=coalesce(escalated_at,p_now),updated_at=p_now where id=obligation.id returning * into obligation;
    else
      alert_title := rule.name; alert_priority := 'HIGH';
    end if;
    insert into public.internal_notifications(notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
    values('FINANCIAL_OBLIGATION',alert_title,'Obligación mensual pendiente. Revisa y marca como pagado cuando corresponda.','UNREAD','financial-alert:'||obligation.obligation_key,'PAYMENTS',alert_priority,true,'FinancialAlertObligation',obligation.id::text,'/operations#financial-alerts',jsonb_build_object('obligation_key',obligation.obligation_key,'accounting_period',obligation.accounting_period))
    on conflict(correlation_id) do update set title=excluded.title,message=excluded.message,status='UNREAD',priority=excluded.priority,action_required=true,metadata=excluded.metadata;
    return next obligation;
  end loop;
end $$;

create or replace function public.mark_financial_alert_paid(p_obligation_id uuid)
returns public.financial_alert_obligations
language plpgsql security definer set search_path=public as $$
declare result public.financial_alert_obligations%rowtype;
begin
  if not public.can_administer() then raise exception 'Acceso Founder requerido.'; end if;
  update public.financial_alert_obligations
    set status='PAID',paid_at=now(),paid_by=auth.uid(),updated_at=now()
    where id=p_obligation_id and status='PENDING' returning * into result;
  if result.id is null then raise exception 'La obligación no está pendiente.'; end if;
  update public.internal_notifications set status='RESOLVED',action_required=false
    where correlation_id='financial-alert:'||result.obligation_key;
  return result;
end $$;

revoke all on function public.ensure_financial_alerts(timestamptz) from public,anon;
revoke all on function public.mark_financial_alert_paid(uuid) from public,anon;
grant execute on function public.ensure_financial_alerts(timestamptz) to authenticated;
grant execute on function public.mark_financial_alert_paid(uuid) to authenticated;

commit;

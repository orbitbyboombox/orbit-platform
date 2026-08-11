begin;

create table if not exists public.financial_integrity_status(
  id uuid primary key default gen_random_uuid(),status_key text not null unique default 'PRIMARY',integrity_percent numeric(5,2) not null default 100,
  reservation_sync text not null default 'OK',finance_sync text not null default 'OK',dashboard_sync text not null default 'OK',
  business_intelligence_sync text not null default 'OK',reports_sync text not null default 'OK',
  affected_records integer not null default 0,details jsonb not null default '{}',checked_at timestamptz not null default now(),
  checked_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
insert into public.financial_integrity_status(status_key)values('PRIMARY')on conflict do nothing;

create or replace function public.validate_financial_integrity()returns public.financial_integrity_status
language plpgsql security definer set search_path=public as $$
declare missing_records integer:=0;revenue_mismatches integer:=0;invoice_mismatches integer:=0;affected integer:=0;result public.financial_integrity_status;
begin
  select count(*) into missing_records from public.projects p join public.quotations q on q.project_id=p.id and q.status='ACCEPTED' and q.deleted_at is null
    left join public.financial_event_records f on f.project_id=p.id where p.deleted_at is null and upper(p.status)not in('CANCELLED','CANCELED','ARCHIVED')and f.id is null;
  select count(*) into revenue_mismatches from public.financial_event_records f join public.quotations q on q.id=f.quotation_id
    where f.status='CONFIRMED'and abs(f.revenue-coalesce(q.final_customer_price,q.grand_total,0))>1;
  select count(*) into invoice_mismatches from public.financial_event_records f join public.invoices i on i.id=f.invoice_id
    where i.deleted_at is null and i.status<>'CANCELLED'and(abs(f.invoiced_amount-i.amount)>1 or abs(f.paid_amount-i.paid_amount)>1 or abs(f.outstanding_balance-greatest(i.amount-i.paid_amount,0))>1);
  affected:=missing_records+revenue_mismatches+invoice_mismatches;
  update public.financial_integrity_status set integrity_percent=case when affected=0 then 100 else greatest(0,100-affected)end,
    reservation_sync=case when missing_records=0 then'OK'else'WARNING'end,finance_sync=case when revenue_mismatches+invoice_mismatches=0 then'OK'else'WARNING'end,
    dashboard_sync=case when affected=0 then'OK'else'WARNING'end,business_intelligence_sync=case when affected=0 then'OK'else'WARNING'end,reports_sync=case when affected=0 then'OK'else'WARNING'end,
    affected_records=affected,details=jsonb_build_object('missingFinancialRecords',missing_records,'revenueMismatches',revenue_mismatches,'invoiceMismatches',invoice_mismatches),
    checked_at=now(),checked_by=auth.uid(),updated_at=now()where status_key='PRIMARY' returning * into result;
  return result;
end$$;

create or replace function public.repair_financial_integrity(p_reason text)returns public.financial_integrity_status
language plpgsql security definer set search_path=public as $$declare item record;before_state public.financial_integrity_status;after_state public.financial_integrity_status;
begin
  if not public.can_administer()then raise exception'Permiso de Founder requerido.';end if;
  if length(trim(p_reason))<3 then raise exception'El motivo de reparación es obligatorio.';end if;
  select * into before_state from public.validate_financial_integrity();
  for item in select id from public.projects loop perform public.sync_estimated_cost_sheet(item.id);perform public.sync_financial_event(item.id);perform public.sync_event_profitability(item.id);end loop;
  select * into after_state from public.validate_financial_integrity();
  insert into public.audit_events(entity_type,entity_id,action,actor_id,previous_state,new_state,reason)
  values('FinancialIntegrity','PRIMARY','REPAIR',auth.uid(),to_jsonb(before_state),to_jsonb(after_state),trim(p_reason));
  return after_state;
end$$;

create or replace function public.financial_integrity_source_changed()returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.validate_financial_integrity();return case when tg_op='DELETE'then old else new end;end$$;
drop trigger if exists financial_integrity_validate on public.financial_event_records;
create trigger financial_integrity_validate after insert or update or delete on public.financial_event_records for each row execute function public.financial_integrity_source_changed();

alter table public.financial_integrity_status enable row level security;
create policy financial_integrity_founder_read on public.financial_integrity_status for select using(public.can_administer());
revoke insert,update,delete on public.financial_integrity_status from authenticated;
revoke all on function public.validate_financial_integrity()from public,anon;grant execute on function public.validate_financial_integrity()to authenticated;
revoke all on function public.repair_financial_integrity(text)from public,anon;grant execute on function public.repair_financial_integrity(text)to authenticated;
drop trigger if exists financial_integrity_audit on public.financial_integrity_status;
create trigger financial_integrity_audit after update on public.financial_integrity_status for each row execute function public.audit_row_change();
select public.validate_financial_integrity();
commit;

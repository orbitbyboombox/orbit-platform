begin;

-- Production close gate: account projections are refreshed first, then the
-- canonical audit must pass before finalization begins. Operational event
-- closure remains out of scope for this financial gate.
create or replace function public.close_staff_month(p_month date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid();
  month_start date:=date_trunc('month',p_month)::date;
  close_row public.staff_monthly_closes%rowtype;
  account_row public.staff_monthly_accounts%rowtype;
  next_version integer;
  summary jsonb;
  audit jsonb;
  account_count integer:=0;
  finalized_count integer:=0;
  excluded_count integer:=0;
  blocker text;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede cerrar el mes.';
  end if;

  perform public.generate_staff_monthly_accounts(month_start);

  insert into public.staff_monthly_closes(accounting_month,due_date)
  values(month_start,month_start+24)
  on conflict(accounting_month) do nothing;
  select * into close_row from public.staff_monthly_closes where accounting_month=month_start for update;
  if close_row.status in('CLOSED','PAID') then return public.preview_staff_monthly_close(month_start); end if;
  if close_row.status not in('OPEN','REOPENED') then raise exception 'El mes no está disponible para cierre.'; end if;

  audit:=public.staff_month_financial_audit(month_start);
  if jsonb_array_length(audit->'criticalErrors')>0 then
    raise exception 'Cierre mensual bloqueado por auditoría financiera: %',audit->'criticalErrors';
  end if;

  select count(*) into account_count from public.staff_monthly_accounts where accounting_month=month_start;
  if account_count=0 then raise exception 'No existen liquidaciones Staff para el período.'; end if;
  select format('%s: %s',account.staff_id,coalesce(account.review_reason,'revisión financiera requerida')) into blocker
  from public.staff_monthly_accounts account
  where account.accounting_month=month_start and account.work_net>0 and account.review_required limit 1;
  if blocker is not null then raise exception 'Cierre mensual bloqueado por inconsistencia financiera: %',blocker; end if;

  next_version:=close_row.close_version+1;
  for account_row in select * from public.staff_monthly_accounts where accounting_month=month_start order by staff_id for update loop
    if account_row.work_net<=0 then
      excluded_count:=excluded_count+1;
      update public.staff_monthly_accounts set review_required=false,review_reason='Excluida del cierre mensual: valor de trabajo confirmado igual a cero.',updated_at=now()
      where id=account_row.id and settlement_status<>'FINALIZED' and payment_status<>'PAID';
      insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
      values(account_row.id,'EXCLUDED_ZERO_VALUE',actor,'Excluida del cierre mensual sin bloquear al resto del Staff.',coalesce(account_row.calculation,'{}'::jsonb));
      continue;
    end if;
    if account_row.settlement_status<>'FINALIZED' then
      update public.staff_monthly_accounts set settlement_status='FINALIZED',finalized_at=now(),finalized_by=actor,finalized_snapshot=calculation,updated_at=now() where id=account_row.id;
      insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state) values(account_row.id,'FINALIZED',actor,coalesce(account_row.calculation,'{}'::jsonb));
    end if;
    finalized_count:=finalized_count+1;
  end loop;

  summary:=public.preview_staff_monthly_close(month_start)||jsonb_build_object('status','CLOSED','version',next_version,'finalizedStaff',finalized_count,'excludedStaff',excluded_count,'closeRule','CONFIRMED_EVENT_STAFF_PAYMENTS','operationalCloseRequired',false);
  insert into public.staff_monthly_close_items(monthly_close_id,close_version,settlement_id,staff_id,project_id,settlement_snapshot,eligibility_override_reason)
  select close_row.id,next_version,payment.id,payment.staff_id,payment.project_id,to_jsonb(payment),null
  from public.event_staff_payments payment
  where payment.accounting_month=month_start and payment.status='CONFIRMED' and payment.deleted_at is null and payment.total_internal_payment>0
  on conflict do nothing;
  update public.staff_monthly_closes set status='CLOSED',close_version=next_version,summary_snapshot=summary,closed_at=now(),closed_by=actor,reopened_at=null,reopened_by=null,reopen_reason=null,updated_at=now() where id=close_row.id;
  return summary;
end;
$$;

commit;

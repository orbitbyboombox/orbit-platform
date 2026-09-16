begin;

-- Closing a Staff month is the accounting distribution gate: every canonical
-- monthly account is calculated, reviewed and frozen before the boleta request
-- is sent. Payment happens afterwards and advances the close to PAID.
create or replace function public.close_staff_month(p_month date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  month_start date:=date_trunc('month',p_month)::date;
  close_row public.staff_monthly_closes%rowtype;
  next_version integer;
  summary jsonb;
  account_count integer:=0;
  draft_count integer:=0;
  review_count integer:=0;
  blocking_count integer:=0;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede cerrar el mes.';
  end if;

  perform public.generate_staff_monthly_accounts(month_start);
  insert into public.staff_monthly_closes(accounting_month,due_date)
  values(month_start,month_start+24)
  on conflict(accounting_month) do nothing;

  select * into close_row
  from public.staff_monthly_closes
  where accounting_month=month_start
  for update;

  if close_row.status in('CLOSED','PAID') then
    return public.preview_staff_monthly_close(month_start);
  end if;
  if close_row.status not in('OPEN','REOPENED') then
    raise exception 'El mes no está disponible para cierre.';
  end if;

  select count(*),
    count(*) filter(where settlement_status<>'FINALIZED'),
    count(*) filter(where review_required or work_net<=0),
    coalesce(sum(jsonb_array_length(public.staff_monthly_blocking_events(staff_id,month_start))),0)
  into account_count,draft_count,review_count,blocking_count
  from public.staff_monthly_accounts
  where accounting_month=month_start;

  if account_count=0 then
    raise exception 'No existen liquidaciones Staff para el período.';
  end if;
  if draft_count>0 or review_count>0 or blocking_count>0 then
    raise exception 'Cierre mensual pendiente: % liquidación(es) sin finalizar, % en revisión y % Evento(s) operativamente pendientes.',draft_count,review_count,blocking_count;
  end if;

  next_version:=close_row.close_version+1;
  summary:=public.preview_staff_monthly_close(month_start);
  insert into public.staff_monthly_close_items(
    monthly_close_id,close_version,settlement_id,staff_id,project_id,
    settlement_snapshot,eligibility_override_reason
  )
  select close_row.id,next_version,f.settlement_id,f.staff_id,f.project_id,
    to_jsonb(f),o.reason
  from public.staff_settlement_financials f
  left join public.event_operational_closures c on c.project_id=f.project_id
  left join public.staff_monthly_close_eligibility_overrides o on o.settlement_id=f.settlement_id
  where f.accounting_month=month_start
    and (c.status='CLOSED' or o.settlement_id is not null)
  on conflict do nothing;

  update public.staff_monthly_closes
  set status='CLOSED',close_version=next_version,summary_snapshot=summary,
    closed_at=now(),closed_by=actor,reopened_at=null,reopened_by=null,
    reopen_reason=null,updated_at=now()
  where id=close_row.id;

  return public.preview_staff_monthly_close(month_start);
end;
$$;

comment on function public.close_staff_month(date) is
  'Freezes canonical Staff monthly accounts for boleta distribution. Payment completion advances the close to PAID.';

create or replace function public.refresh_staff_month_payment_state(p_month date)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  month_start date:=date_trunc('month',p_month)::date;
  close_row public.staff_monthly_closes%rowtype;
  pending_accounts integer:=0;
begin
  if auth.uid() is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede actualizar el estado de pago mensual.';
  end if;
  select * into close_row
  from public.staff_monthly_closes
  where accounting_month=month_start
  for update;
  if not found then return 'OPEN'; end if;

  select count(*) into pending_accounts
  from public.staff_monthly_accounts
  where accounting_month=month_start and payment_status<>'PAID';

  if close_row.status='CLOSED' and pending_accounts=0 then
    update public.staff_monthly_closes
    set status='PAID',paid_at=coalesce(paid_at,now()),updated_at=now()
    where id=close_row.id;
    return 'PAID';
  end if;
  return close_row.status;
end;
$$;

revoke all on function public.close_staff_month(date) from public,anon;
grant execute on function public.close_staff_month(date) to authenticated,service_role;
revoke all on function public.refresh_staff_month_payment_state(date) from public,anon;
grant execute on function public.refresh_staff_month_payment_state(date) to authenticated,service_role;

commit;

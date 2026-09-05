-- A Staff month can only close after every required settlement is fully paid.
begin;

create or replace function public.close_staff_month(p_month date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid(); month_start date:=date_trunc('month',p_month)::date;
  close_row public.staff_monthly_closes%rowtype; next_version integer; summary jsonb;
  pending_boletas integer:=0; ready_to_pay integer:=0; unpaid integer:=0; pending_events integer:=0;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede cerrar el mes.';end if;
  insert into public.staff_monthly_closes(accounting_month,due_date) values(month_start,month_start+24) on conflict(accounting_month) do nothing;
  select * into close_row from public.staff_monthly_closes where accounting_month=month_start for update;
  if close_row.status not in('OPEN','REOPENED') then raise exception 'El mes no está abierto para cierre.';end if;

  select count(*) filter(where expected_amount>0 and boleta_status in('PENDING','RECEIVED','REJECTED')),
    count(*) filter(where expected_amount>0 and payment_status='READY_TO_PAY'),
    count(*) filter(where expected_amount>0 and payment_status<>'PAID')
    into pending_boletas,ready_to_pay,unpaid
  from public.staff_monthly_accounts where accounting_month=month_start;
  select coalesce(sum(jsonb_array_length(public.staff_monthly_blocking_events(account.staff_id,month_start))),0)
    into pending_events from public.staff_monthly_accounts account where account.accounting_month=month_start;
  if pending_events>0 or pending_boletas>0 or ready_to_pay>0 or unpaid>0 then
    raise exception 'Cierre mensual pendiente: % Evento(s) pendientes, % boleta(s) pendientes/en revisión/rechazadas, % listo(s) para pagar, % liquidación(es) impagas.',pending_events,pending_boletas,ready_to_pay,unpaid;
  end if;

  next_version:=close_row.close_version+1;summary:=public.preview_staff_monthly_close(month_start);
  insert into public.staff_monthly_close_items(monthly_close_id,close_version,settlement_id,staff_id,project_id,settlement_snapshot,eligibility_override_reason)
  select close_row.id,next_version,f.settlement_id,f.staff_id,f.project_id,to_jsonb(f),o.reason from public.staff_settlement_financials f
  left join public.event_operational_closures c on c.project_id=f.project_id left join public.staff_monthly_close_eligibility_overrides o on o.settlement_id=f.settlement_id
  where f.accounting_month=month_start and (c.status='CLOSED' or o.settlement_id is not null);
  update public.staff_monthly_closes set status='CLOSED',close_version=next_version,summary_snapshot=summary,closed_at=now(),closed_by=actor,reopened_at=null,reopened_by=null,reopen_reason=null,updated_at=now() where id=close_row.id;
  return public.preview_staff_monthly_close(month_start);
end $$;

comment on function public.close_staff_month(date) is 'Final Staff month close gate: no pending Events, boletas, ready-to-pay or unpaid required settlements.';
commit;

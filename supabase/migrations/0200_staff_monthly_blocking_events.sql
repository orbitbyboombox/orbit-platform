begin;

create or replace function public.staff_monthly_blocking_events(p_staff_id uuid,p_month date)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'settlementId',payment.id,'projectId',project.id,'eventId',project.orbit_event_id,
    'eventDate',project.event_date,'event',project.name,
    'service',coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type),
    'status',coalesce(project.status,'OPEN')) order by project.event_date,project.event_time,payment.id),'[]'::jsonb)
  from public.event_staff_payments payment join public.projects project on project.id=payment.project_id
  where payment.staff_id=p_staff_id and payment.status='CONFIRMED' and payment.deleted_at is null
    and project.event_date>=date_trunc('month',p_month)::date and project.event_date<(date_trunc('month',p_month)+interval '1 month')::date
    and project.deleted_at is null and upper(coalesce(project.status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED','QA')
    and not exists(select 1 from public.event_operational_closures closure where closure.project_id=project.id and closure.status='CLOSED')
    and not exists(select 1 from public.staff_monthly_close_eligibility_overrides override_record where override_record.settlement_id=payment.id)
$$;

create or replace function public.ensure_staff_monthly_account(p_staff_id uuid,p_month date)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare month_start date:=date_trunc('month',p_month)::date; item public.staff_monthly_accounts%rowtype; calc jsonb; inserted_count integer:=0;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' and (auth.uid() is null or not public.can_administer()) then raise exception 'Acceso autorizado requerido.';end if;
  calc:=public.calculate_staff_monthly_settlement(p_staff_id,month_start);
  calc:=jsonb_set(calc,'{blockingEvents}',public.staff_monthly_blocking_events(p_staff_id,month_start),true);
  insert into public.staff_monthly_accounts(staff_id,accounting_month,expected_amount)
  values(p_staff_id,month_start,(calc->>'finalTransferAmount')::numeric) on conflict(staff_id,accounting_month) do nothing;
  get diagnostics inserted_count=row_count;
  select * into item from public.staff_monthly_accounts where staff_id=p_staff_id and accounting_month=month_start for update;
  if item.settlement_status<>'FINALIZED' and item.payment_status<>'PAID' then
    update public.staff_monthly_accounts set expected_amount=(calc->>'finalTransferAmount')::numeric,
      work_net=(calc->>'workNet')::numeric,boleta_gross=(calc->>'boletaGross')::numeric,withholding_rate=(calc->>'withholdingRate')::numeric,
      withholding_amount=(calc->>'withholdingAmount')::numeric,boleta_net=(calc->>'boletaNet')::numeric,
      advances_total=(calc->>'advancesTotal')::numeric,reimbursements_total=(calc->>'reimbursementsTotal')::numeric,
      final_transfer_amount=(calc->>'finalTransferAmount')::numeric,excess_advance=(calc->>'excessAdvance')::numeric,
      event_count=(calc->>'eventCount')::integer,calculation=calc,review_required=(calc->>'reviewRequired')::boolean,
      review_reason=nullif(calc->>'reviewReason',''),updated_at=now() where id=item.id returning * into item;
    insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state)
    values(item.id,case when inserted_count>0 then 'GENERATED' else 'REFRESHED' end,auth.uid(),calc);
  end if;
  return item;
end $$;

commit;

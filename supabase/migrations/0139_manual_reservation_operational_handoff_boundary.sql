begin;

-- A manual Reservation may be persisted before the contract is signed or the
-- required deposit is collected. Those are valid commercial states and must
-- not be rolled back merely because the operational handoff is not due yet.
create or replace function public.prepare_confirmed_reservation_records(
  p_project_id uuid,
  p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  commercial_result jsonb;
  operational_result jsonb;
  reservation_status text;
begin
  commercial_result:=public.prepare_confirmed_reservation_records_commercial_core(
    p_project_id,
    p_actor_id
  );

  select status into reservation_status
  from public.crm_reservations
  where project_id=p_project_id
  order by updated_at desc
  limit 1;

  if reservation_status='CONFIRMED' then
    operational_result:=public.ensure_event_operational_handoff(
      p_project_id,
      p_actor_id
    );
  else
    operational_result:=jsonb_build_object(
      'status','DEFERRED',
      'reason','COMMERCIAL_CONFIRMATION_PENDING',
      'reservationStatus',reservation_status
    );
  end if;

  return commercial_result||jsonb_build_object(
    'operationalHandoff',operational_result
  );
end $$;

revoke all on function public.prepare_confirmed_reservation_records(uuid,uuid)
  from public,anon;
grant execute on function public.prepare_confirmed_reservation_records(uuid,uuid)
  to authenticated,service_role;

-- Contract and Payment Ledger changes remain the canonical path for reaching
-- commercial confirmation. At that exact transition, prepare Operations once;
-- the handoff function is idempotent and preserves existing Founder edits.
create or replace function public.sync_project_commercial_state(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  agreement_signed boolean:=false;
  total numeric:=0;
  paid numeric:=0;
  required_deposit numeric:=0;
  next_status text;
  actor uuid;
begin
  select exists(
    select 1 from agreements where project_id=p_project_id and status='SIGNED'
  ) into agreement_signed;
  select coalesce(amount,0),coalesce(paid_amount,0) into total,paid
  from invoices where project_id=p_project_id and deleted_at is null
  order by created_at desc limit 1;
  required_deposit:=round(total*0.5);
  next_status:=case when not agreement_signed then 'CONTRACT_PENDING'
    when total<=0 or paid<required_deposit then 'WAITING_DEPOSIT'
    else 'CONFIRMED' end;

  update projects set status=next_status,updated_at=now()
  where id=p_project_id and deleted_at is null
    and upper(status) not in(
      'CANCELLED','CANCELED','ARCHIVED','PRODUCTION','EVENT','DELIVERY',
      'CLOSED','COMPLETED'
    );
  update crm_reservations
  set status=public.commercial_reservation_status(next_status),updated_at=now()
  where project_id=p_project_id and status not in('CANCELLED','ARCHIVED');

  if next_status='CONFIRMED' then
    select coalesce(updated_by,created_by,auth.uid()) into actor
    from projects where id=p_project_id;
    if actor is not null then
      perform public.ensure_event_operational_handoff(p_project_id,actor);
    end if;
  end if;

  return jsonb_build_object(
    'projectId',p_project_id,
    'agreementSigned',agreement_signed,
    'total',total,
    'paid',paid,
    'requiredDeposit',required_deposit,
    'status',next_status
  );
end $$;

revoke all on function public.sync_project_commercial_state(uuid)
  from public,anon;
grant execute on function public.sync_project_commercial_state(uuid)
  to authenticated,service_role;

commit;

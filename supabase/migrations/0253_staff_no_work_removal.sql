begin;

-- Removes a staff member from an event as one audited, idempotent operation.
-- It deliberately refuses to rewrite any account or movement that already has
-- irreversible money recorded.
create or replace function public.remove_staff_from_event_no_work(
  p_assignment_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  seed public.assignments%rowtype;
  actor uuid := auth.uid();
  active_count integer := 0;
  payment_count integer := 0;
  project_customer uuid;
  project_event text;
  correlation text;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder/Admin puede retirar Staff del Evento.' using errcode='42501';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'Indica el motivo del retiro.' using errcode='22023';
  end if;

  select * into seed from public.assignments
  where id=p_assignment_id and deleted_at is null
  for update;
  if seed.id is null then
    -- A retry is successful without writing a second audit record.
    if exists(select 1 from public.assignments where id=p_assignment_id and deleted_at is not null) then
      return jsonb_build_object('ok',true,'already_removed',true,'assignment_id',p_assignment_id);
    end if;
    raise exception 'La asignación ya no está disponible.' using errcode='P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(seed.project_id::text||':'||seed.staff_id::text||':no-work-removal',0));
  select count(*) into active_count from public.assignments
  where project_id=seed.project_id and staff_id=seed.staff_id and deleted_at is null
    and status not in ('CANCELLED','REJECTED')
    and assignment_type in ('OPERATOR','ASSEMBLY','DISASSEMBLY');

  select count(*) into payment_count
  from public.event_staff_settlement_movements m
  join public.event_staff_payments p on p.id=m.settlement_id
  where p.project_id=seed.project_id and p.staff_id=seed.staff_id
    and p.deleted_at is null and m.deleted_at is null
    and m.movement_type in ('ADVANCE','PAYMENT');
  if payment_count > 0 or exists(
    select 1 from public.event_staff_payments
    where project_id=seed.project_id and staff_id=seed.staff_id and deleted_at is null
      and paid_amount > 0
  ) or exists(
    select 1 from public.staff_monthly_accounts a
    where a.staff_id=seed.staff_id
      and a.accounting_month=(select date_trunc('month',event_date)::date from public.projects where id=seed.project_id)
      and (a.payment_status='PAID' or a.settlement_status='FINALIZED')
  ) then
    raise exception 'La liquidación ya contiene dinero pagado o está cerrada; requiere corrección financiera controlada.' using errcode='55000';
  end if;

  select customer_id,orbit_event_id into project_customer,project_event from public.projects where id=seed.project_id and deleted_at is null;
  if project_event is null then raise exception 'Evento no encontrado.' using errcode='P0002'; end if;
  correlation := 'staff-no-work:'||seed.project_id::text||':'||seed.staff_id::text;

  update public.assignments set status='CANCELLED', deleted_at=now(), response_at=coalesce(response_at,now()), reason=trim(p_reason), updated_by=actor, updated_at=now()
  where project_id=seed.project_id and staff_id=seed.staff_id and deleted_at is null
    and status not in ('CANCELLED','REJECTED')
    and assignment_type in ('OPERATOR','ASSEMBLY','DISASSEMBLY');

  if not exists(select 1 from public.timeline_events where correlation_id=correlation) then
    insert into public.timeline_events(customer_id,project_id,event_type,title,description,previous_state,new_state,reason,occurred_at,created_by,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,staff_id)
    values(project_customer,seed.project_id,'STAFF_REMOVED','Staff retirado: no trabajó en el Evento.',trim(p_reason),'ASSIGNED','REMOVED',trim(p_reason),now(),actor,project_event,actor,'Founder','Operations','STAFF_REMOVED','StaffAssignmentBatch',seed.project_id::text,'Colaborador retirado del Evento; no se generará remuneración.',correlation,seed.staff_id);
  end if;

  -- Assignment triggers cancel the event settlement; refresh the month only
  -- while it is still open, preserving all historical ledger movements.
  perform public.ensure_staff_monthly_account(seed.staff_id,(select event_date from public.projects where id=seed.project_id));
  return jsonb_build_object('ok',true,'already_removed',false,'project_id',seed.project_id,'staff_id',seed.staff_id,'assignments_removed',active_count,'correlation_id',correlation);
end $$;

revoke all on function public.remove_staff_from_event_no_work(uuid,text) from public,anon;
grant execute on function public.remove_staff_from_event_no_work(uuid,text) to authenticated,service_role;

commit;

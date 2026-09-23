begin;

-- reservation_transactions.status remains constrained to STARTED, CREATED,
-- PROCESSING, FAILED and COMPLETED.
do $patch$
declare
  ddl text;
  invalid_clause constant text := 'update public.reservation_transactions set project_id=null, orbit_event_id=null, status=''CANCELLED'', current_step=''EVENT_DELETED'', last_error=''SOURCE_EVENT_DELETED'', updated_at=now() where project_id=p_project_id;';
  safe_clause constant text := 'update public.reservation_transactions set project_id=null, orbit_event_id=null, current_step=''EVENT_DELETED'', last_error=''SOURCE_EVENT_DELETED'', updated_at=now() where project_id=p_project_id;';
begin
  select pg_get_functiondef('public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure) into ddl;
  if position(invalid_clause in ddl) = 0 then
    raise exception 'Canonical purge function did not contain the known invalid reservation status mutation';
  end if;
  execute replace(ddl, invalid_clause, safe_clause);
end $patch$;

create or replace function public.purge_event_test_full(
  p_project_id uuid,
  p_confirmation text,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  project_row public.projects%rowtype;
  data_classification text;
begin
  if actor is null or public.current_orbit_role() <> 'CEO' then
    raise exception 'Solo CEO/Founder puede purgar una prueba.';
  end if;
  if upper(trim(coalesce(p_confirmation, ''))) <> 'PURGAR PRUEBA' then
    raise exception 'Escribe PURGAR PRUEBA para confirmar la purga QA.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo es obligatorio.';
  end if;
  select * into project_row from public.projects where id=p_project_id for update;
  if not found then return jsonb_build_object('status','ALREADY_PURGED','projectId',p_project_id); end if;
  data_classification := upper(coalesce(project_row.operations->>'dataClassification',''));
  if data_classification not in ('QA','TEST') then
    raise exception 'Solo proyectos marcados inequívocamente QA o TEST pueden purgarse.';
  end if;

  delete from public.event_staff_block_costs where project_id=p_project_id;
  delete from public.event_staff_settlement_adjustments where project_id=p_project_id;
  delete from public.event_staff_settlement_movements where project_id=p_project_id;
  delete from public.event_staff_payments where project_id=p_project_id;
  delete from public.staff_assignment_cancellations where project_id=p_project_id;
  delete from public.asset_assignments where project_id=p_project_id;
  delete from public.event_vehicle_assignments where project_id=p_project_id;
  delete from public.vehicle_route_events where project_id=p_project_id;
  delete from public.assignments where project_id=p_project_id;
  delete from public.staff_assignment_requests where project_id=p_project_id;
  delete from public.event_staff_requirements where project_id=p_project_id;
  delete from public.event_operational_requirements where project_id=p_project_id;
  delete from public.event_operational_blocks where project_id=p_project_id;
  delete from public.calendar_sync where project_id=p_project_id;
  delete from public.drive_sync where project_id=p_project_id;
  delete from public.mercado_pago_transactions where project_id=p_project_id;
  delete from public.mercado_pago_payment_intents where project_id=p_project_id;
  delete from public.invoice_payments where invoice_id in (select id from public.invoices where project_id=p_project_id);
  delete from public.receivable_movements where invoice_id in (select id from public.invoices where project_id=p_project_id);
  delete from public.financial_event_records where project_id=p_project_id;
  delete from public.invoices where project_id=p_project_id;
  delete from public.reservation_transactions where project_id=p_project_id;
  delete from public.crm_reservations where project_id=p_project_id;
  delete from public.crm_events where project_id=p_project_id;
  delete from public.timeline_events where project_id=p_project_id;
  delete from public.projects where id=p_project_id;
  return jsonb_build_object('status','PURGED_QA','projectId',p_project_id);
end;
$$;

revoke all on function public.purge_event_test_full(uuid,text,text) from public,anon;
grant execute on function public.purge_event_test_full(uuid,text,text) to authenticated;
commit;

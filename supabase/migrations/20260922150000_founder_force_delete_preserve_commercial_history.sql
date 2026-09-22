begin;

-- Operational deletion must not destroy the immutable commercial record.
-- Historical rows are detached from the soft-deleted project while retaining
-- the former identity for audit and reporting.
alter table public.reservation_commercial_negotiations
  add column if not exists former_project_id uuid;
alter table public.reservation_commercial_negotiations
  alter column project_id drop not null;
alter table public.reservation_commercial_negotiations
  drop constraint if exists reservation_commercial_negotiations_project_id_fkey;
alter table public.reservation_commercial_negotiations
  add constraint reservation_commercial_negotiations_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;
create index if not exists reservation_commercial_negotiations_former_project_idx
  on public.reservation_commercial_negotiations(former_project_id, created_at desc);

alter table public.project_commercial_origins
  add column if not exists former_project_id uuid,
  add column if not exists former_orbit_event_id text;
alter table public.project_commercial_origins
  alter column project_id drop not null;
alter table public.project_commercial_origins
  drop constraint if exists project_commercial_origins_project_id_fkey;
alter table public.project_commercial_origins
  add constraint project_commercial_origins_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;
create index if not exists project_commercial_origins_former_project_idx
  on public.project_commercial_origins(former_project_id);

create or replace function public.prevent_commercial_negotiation_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('orbit.force_delete_detach', true) = 'on'
     and tg_op = 'UPDATE'
     and old.project_id is not null
     and new.project_id is null
     and new.former_project_id = old.project_id then
    return new;
  end if;
  raise exception 'El historial de negociación comercial es inmutable.';
end
$$;

create or replace function public.protect_project_commercial_origin()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if current_setting('orbit.force_delete_detach', true) = 'on'
     and tg_op = 'UPDATE'
     and old.project_id is not null
     and new.project_id is null
     and new.former_project_id = old.project_id then
    return new;
  end if;
  raise exception 'El origen comercial aceptado del Evento es inmutable.';
end;
$$;

create or replace function public.purge_event_controlled(
  p_project_id uuid,
  p_confirmation text,
  p_reason text,
  p_delete_orphan_customer boolean default false
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  project_row public.projects%rowtype;
  existing_job public.event_deletion_jobs%rowtype;
  external_cleanup jsonb;
  has_real_finance boolean := false;
  customer_has_other_events boolean := false;
begin
  if not is_service and (actor is null or public.current_orbit_role() <> 'CEO') then
    raise exception 'Solo CEO/Founder puede eliminar un Evento.';
  end if;
  if upper(trim(coalesce(p_confirmation, ''))) <> 'ELIMINAR' then
    raise exception 'Escribe ELIMINAR para confirmar.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo es obligatorio.';
  end if;

  select * into project_row from public.projects where id = p_project_id for update;
  if not found then
    return jsonb_build_object('status','ALREADY_DELETED','projectId',p_project_id);
  end if;
  select * into existing_job from public.event_deletion_jobs where project_id=p_project_id for update;
  if found then
    return jsonb_build_object('status', existing_job.status, 'projectId', p_project_id, 'jobId', existing_job.id);
  end if;

  select exists(
    select 1 from public.invoice_payments payment
    join public.invoices invoice on invoice.id = payment.invoice_id
    where invoice.project_id = p_project_id and payment.deleted_at is null
  ) or exists(
    select 1 from public.invoices invoice
    where invoice.project_id = p_project_id and invoice.deleted_at is null
      and coalesce(invoice.paid_amount, 0) > 0
  ) or exists(
    select 1 from public.documents document
    where document.project_id = p_project_id and document.deleted_at is null
      and document.external_tax_document_type is not null
  ) into has_real_finance;

  select jsonb_build_object(
    'calendarEventIds', coalesce((select jsonb_agg(distinct value) from (select external_event_id as value from public.calendar_sync where project_id=p_project_id and external_event_id is not null union all select nova_external_event_id from public.calendar_sync where project_id=p_project_id and nova_external_event_id is not null union all select legacy_external_event_id from public.calendar_sync where project_id=p_project_id and legacy_external_event_id is not null) ids), '[]'::jsonb),
    'driveFileIds', coalesce((select jsonb_agg(distinct drive_file_id) from public.documents where project_id=p_project_id and drive_file_id is not null), '[]'::jsonb),
    'driveFolderIds', coalesce((select jsonb_agg(distinct external_folder_id) from public.drive_sync where project_id=p_project_id and external_folder_id is not null), '[]'::jsonb),
    'storageObjects', coalesce((select jsonb_agg(jsonb_build_object('bucket', storage_bucket, 'path', storage_path)) from public.documents where project_id=p_project_id and storage_path is not null), '[]'::jsonb),
    'hasRealFinance', has_real_finance,
    'orbitEventId', project_row.orbit_event_id
  ) into external_cleanup;

  insert into public.event_deletion_jobs(project_id, customer_id, actor_id, reason, delete_orphan_customer, status, external_cleanup)
  values (p_project_id, project_row.customer_id, actor, trim(p_reason), p_delete_orphan_customer, 'REQUESTED', external_cleanup);

  -- Operational rows only. Commercial quotations, items, negotiations,
  -- accepted snapshots and append-only timeline remain untouched.
  delete from public.asset_assignments where project_id=p_project_id;
  delete from public.event_vehicle_assignments where project_id=p_project_id;
  delete from public.vehicle_route_events where project_id=p_project_id;
  delete from public.assignments where project_id=p_project_id;
  delete from public.staff_assignment_requests where project_id=p_project_id;
  delete from public.staff_assignment_cancellations where project_id=p_project_id;
  delete from public.event_staff_settlement_adjustments where settlement_id in (select id from public.event_staff_payments where project_id=p_project_id);
  delete from public.event_staff_settlement_movements where settlement_id in (select id from public.event_staff_payments where project_id=p_project_id);
  delete from public.event_staff_payments where project_id=p_project_id and upper(coalesce(status,'')) not in ('PAID','CONFIRMED');
  delete from public.expenses where project_id=p_project_id and upper(coalesce(status,'')) not in ('PAID','APPROVED');
  delete from public.event_operational_requirements where project_id=p_project_id;
  delete from public.event_staff_requirements where project_id=p_project_id;
  delete from public.event_checklists where project_id=p_project_id;
  delete from public.event_operational_milestones where project_id=p_project_id;
  delete from public.event_operational_closures where project_id=p_project_id;
  delete from public.project_operational_contracts where project_id=p_project_id;
  delete from public.customer_portal_requests where project_id=p_project_id;
  delete from public.customer_portal_uploads where project_id=p_project_id;
  delete from public.customer_portal_tokens where project_id=p_project_id;
  delete from public.internal_notifications where project_id=p_project_id;
  delete from public.founder_notification_deliveries where project_id=p_project_id;
  delete from public.tasks where project_id=p_project_id;
  delete from public.communications where project_id=p_project_id;
  delete from public.automatic_booking_invitations where project_id=p_project_id;
  delete from public.reservation_execution_diagnostics where project_id=p_project_id;
  delete from public.crm_reservations where project_id=p_project_id;
  update public.crm_events set status='DELETED', updated_at=now() where project_id=p_project_id;
  delete from public.estimated_cost_sheets where project_id=p_project_id;
  delete from public.profit_snapshots where project_id=p_project_id;
  delete from public.event_profitability_statements where project_id=p_project_id;
  delete from public.project_services where project_id=p_project_id;
  delete from public.agreements where project_id=p_project_id and signed_at is null and locked_at is null;
  delete from public.documents where project_id=p_project_id and external_tax_document_type is null;

  -- Detach history instead of deleting it. The former identifiers preserve
  -- audit traceability while allowing the operational project to be removed.
  perform set_config('orbit.force_delete_detach','on',true);
  update public.reservation_commercial_negotiations
    set former_project_id=project_id, project_id=null
    where project_id=p_project_id;
  update public.project_commercial_origins
    set former_project_id=project_id, former_orbit_event_id=project_row.orbit_event_id, project_id=null
    where project_id=p_project_id;
  update public.quotations
    set project_id=null, updated_at=now()
    where project_id=p_project_id;
  perform set_config('orbit.force_delete_detach','off',true);

  if has_real_finance then
    update public.invoices set financial_record_state='SOURCE_EVENT_DELETED', archived_at=now(), archived_by=actor, updated_at=now(), updated_by=actor where project_id=p_project_id and deleted_at is null;
    update public.financial_event_records set status='CANCELLED', traceability=coalesce(traceability,'{}'::jsonb) || jsonb_build_object('sourceEventDeleted', true, 'deletionReason', 'SOURCE_EVENT_DELETED'), updated_at=now() where project_id=p_project_id;
  else
    delete from public.receivable_movements where invoice_id in (select id from public.invoices where project_id=p_project_id);
    delete from public.invoice_payments where invoice_id in (select id from public.invoices where project_id=p_project_id);
    delete from public.accounts_receivable_projection where project_id=p_project_id;
    delete from public.accounts_receivable_history where project_id=p_project_id;
    delete from public.financial_event_records where project_id=p_project_id;
    delete from public.invoices where project_id=p_project_id;
  end if;

  update public.reservation_transactions set project_id=null, orbit_event_id=null, status='CANCELLED', current_step='EVENT_DELETED', last_error='SOURCE_EVENT_DELETED', updated_at=now() where project_id=p_project_id;
  update public.projects set status='DELETED', pipeline_stage='ARCHIVADO', health='BLOCKED', deleted_at=now(), deleted_by=actor, approval_reason=trim(p_reason), updated_by=actor, updated_at=now() where id=p_project_id;
  select exists(select 1 from public.projects where customer_id=project_row.customer_id and id<>p_project_id and deleted_at is null) into customer_has_other_events;
  if p_delete_orphan_customer and not customer_has_other_events then
    update public.customers set deleted_at=now(), deleted_by=actor, updated_at=now(), approval_reason='SOURCE_EVENT_DELETED' where id=project_row.customer_id and deleted_at is null;
  end if;
  update public.event_deletion_jobs set status='REMOVED_FROM_OPERATION', next_retry_at=now() where project_id=p_project_id;
  insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(project_row.customer_id,p_project_id,project_row.orbit_event_id,'EVENT_DELETED_BY_FOUNDER','Evento eliminado por Founder','El evento fue retirado de la operación y su limpieza externa continúa en segundo plano.',actor,'Founder','Administrator','EVENT_DELETED_BY_FOUNDER','Project',p_project_id,'Evento eliminado por Founder.','event-deleted:'||p_project_id,trim(p_reason),actor);
  return jsonb_build_object('status','REMOVED_FROM_OPERATION','projectId',p_project_id,'jobId',(select id from public.event_deletion_jobs where project_id=p_project_id));
end;
$$;

comment on column public.reservation_commercial_negotiations.former_project_id is 'Original operational project identity retained after Founder force-delete.';
comment on column public.project_commercial_origins.former_project_id is 'Original operational project identity retained after Founder force-delete.';

commit;

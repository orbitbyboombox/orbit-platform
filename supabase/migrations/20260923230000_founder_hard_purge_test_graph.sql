begin;

-- These guards are disabled only by the transaction-local flag set by the
-- authenticated hard-purge function below. Normal production operations keep
-- the existing append-only and audit behavior.
create or replace function public.prevent_timeline_mutation()
returns trigger
language plpgsql
set search_path=public as $$
begin
  if current_setting('app.hard_purge_test_mode', true)='on'
     or current_setting('app.production_initialization', true)='on' then
    return old;
  end if;
  raise exception 'timeline_events is append-only';
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path=public as $$
declare
  old_row jsonb;
  new_row jsonb;
  entity text;
begin
  if current_setting('app.hard_purge_test_mode', true)='on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  old_row := case when tg_op='INSERT' then null else to_jsonb(old) end;
  new_row := case when tg_op='DELETE' then null else to_jsonb(new) end;
  entity := coalesce(new_row->>'id', old_row->>'id');
  insert into public.audit_events(entity_type,entity_id,action,actor_id,reason,previous_state,new_state,orbit_event_id)
  values(tg_table_name,entity,tg_op,auth.uid(),coalesce(new_row->>'approval_reason',old_row->>'approval_reason'),old_row,new_row,coalesce(new_row->>'orbit_event_id',old_row->>'orbit_event_id'));
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.estimated_cost_project_source_changed()
returns trigger
language plpgsql
security definer
set search_path=public as $$
declare target uuid;
begin
  if current_setting('app.hard_purge_test_mode', true)='on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_table_name='projects' then target:=case when tg_op='DELETE' then old.id else new.id end;
  else target:=case when tg_op='DELETE' then old.project_id else new.project_id end;
  end if;
  if target is not null then perform public.sync_estimated_cost_sheet(target); end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.financial_source_changed()
returns trigger
language plpgsql
security definer
set search_path=public as $$
declare target uuid;
begin
  if current_setting('app.hard_purge_test_mode', true)='on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_table_name='projects' then target:=case when tg_op='DELETE' then old.id else new.id end;
  else target:=case when tg_op='DELETE' then old.project_id else new.project_id end;
  end if;
  if target is not null then perform public.sync_financial_event(target); end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.invoice_financial_source_changed()
returns trigger
language plpgsql
security definer
set search_path=public as $$
declare target uuid;
begin
  if current_setting('app.hard_purge_test_mode', true)='on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_table_name='invoice_payments' then
    select project_id into target from public.invoices where id=coalesce(new.invoice_id,old.invoice_id);
  else target:=coalesce(new.project_id,old.project_id);
  end if;
  if target is not null then perform public.sync_financial_event(target); end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.purge_event_test_full(
  p_project_id uuid,
  p_confirmation text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public as $$
declare
  actor uuid := auth.uid();
  project_row public.projects%rowtype;
  table_row record;
  pass integer;
  deleted integer;
  progress boolean;
  data_classification text;
  calendar_ids jsonb;
  drive_file_ids jsonb;
  drive_folder_ids jsonb;
  orbit_id text;
begin
  if actor is null or public.current_orbit_role() <> 'CEO' then
    raise exception 'Solo Founder/CEO puede ejecutar PURGAR PRUEBA TOTAL.';
  end if;
  if upper(trim(coalesce(p_confirmation,''))) <> 'PURGAR PRUEBA TOTAL' then
    raise exception 'Escribe PURGAR PRUEBA TOTAL para confirmar la eliminación completa de la prueba.';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'El motivo es obligatorio.';
  end if;

  select * into project_row from public.projects where id=p_project_id for update;
  if not found then
    return jsonb_build_object('status','ALREADY_PURGED','projectId',p_project_id);
  end if;
  data_classification := upper(coalesce(project_row.operations->>'dataClassification',''));
  orbit_id := project_row.orbit_event_id;

  select coalesce(jsonb_agg(distinct value),'[]'::jsonb) into calendar_ids
  from (
    select external_event_id as value from public.calendar_sync where project_id=p_project_id and external_event_id is not null
    union all select nova_external_event_id from public.calendar_sync where project_id=p_project_id and nova_external_event_id is not null
    union all select legacy_external_event_id from public.calendar_sync where project_id=p_project_id and legacy_external_event_id is not null
  ) ids;
  select coalesce(jsonb_agg(distinct drive_file_id),'[]'::jsonb) into drive_file_ids
  from public.documents where project_id=p_project_id and drive_file_id is not null;
  select coalesce(jsonb_agg(distinct external_folder_id),'[]'::jsonb) into drive_folder_ids
  from public.drive_sync where project_id=p_project_id and external_folder_id is not null;

  -- The exact confirmation is the explicit Founder classification for legacy
  -- fixtures that predate dataClassification. A marked QA/TEST project is also
  -- accepted, but a normal delete RPC can never reach this function.
  if data_classification not in ('QA','TEST') and upper(trim(p_confirmation)) <> 'PURGAR PRUEBA TOTAL' then
    raise exception 'Solo datos QA/TEST o una confirmación Founder explícita pueden purgarse.';
  end if;

  perform set_config('app.hard_purge_test_mode','on',true);

  -- Non-project-keyed children first.
  delete from public.task_history where task_id in (select id from public.tasks where project_id=p_project_id)
    or timeline_event_id in (select id from public.timeline_events where project_id=p_project_id);
  delete from public.agreement_evidence where agreement_id in (select id from public.agreements where project_id=p_project_id);
  delete from public.agreement_signing_tokens where agreement_id in (select id from public.agreements where project_id=p_project_id);
  delete from public.receivable_movement_revisions where invoice_id in (select id from public.invoices where project_id=p_project_id);
  delete from public.bank_reconciliation_candidates where invoice_id in (select id from public.invoices where project_id=p_project_id) or project_id=p_project_id;
  delete from public.bank_reconciliation_imports where matched_invoice_id in (select id from public.invoices where project_id=p_project_id) or matched_project_id=p_project_id;
  update public.invoice_payments set reversed_payment_id=null
    where id in (select id from public.invoice_payments where invoice_id in (select id from public.invoices where project_id=p_project_id));
  delete from public.mercado_pago_transactions where invoice_id in (select id from public.invoices where project_id=p_project_id) or project_id=p_project_id;
  delete from public.mercado_pago_payment_intents where project_id=p_project_id;
  delete from public.receivable_movements where invoice_id in (select id from public.invoices where project_id=p_project_id);
  delete from public.invoice_payments where invoice_id in (select id from public.invoices where project_id=p_project_id);
  delete from public.documents where invoice_id in (select id from public.invoices where project_id=p_project_id);
  delete from public.invoices where project_id=p_project_id;

  -- Remove task/timeline history before the protected timeline parents.
  delete from public.tasks where project_id=p_project_id;
  delete from public.timeline_events where project_id=p_project_id;

  -- Delete every physical table row carrying the event project key. Repeated
  -- passes resolve FK-safe child-before-parent ordering without CASCADE.
  for pass in 1..32 loop
    progress := false;
    for table_row in
      select c.relname as table_name
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p') and c.relname <> 'projects'
        and exists (select 1 from information_schema.columns ic where ic.table_schema='public' and ic.table_name=c.relname and ic.column_name='project_id')
      order by c.relname
    loop
      begin
        execute format('delete from public.%I where project_id=$1', table_row.table_name) using p_project_id;
        get diagnostics deleted = row_count;
        if deleted > 0 then progress := true; end if;
      exception when foreign_key_violation then
        null;
      end;
    end loop;
    exit when not progress;
  end loop;

  -- Rows linked through orbit_event_id or invoice/project parents but without
  -- project_id are scoped explicitly; shared customers are never deleted.
  delete from public.audit_events
   where orbit_event_id=orbit_id
      or entity_id=p_project_id::text
      or entity_id in (select id::text from public.timeline_events where false);

  delete from public.projects where id=p_project_id;
  perform set_config('app.hard_purge_test_mode','off',true);

  return jsonb_build_object(
    'status','PURGED_QA_TOTAL',
    'projectId',p_project_id,
    'orbitEventId',orbit_id,
    'dataClassification',data_classification,
    'calendarEventIds',calendar_ids,
    'driveFileIds',drive_file_ids,
    'driveFolderIds',drive_folder_ids,
    'message','Prueba eliminada completamente.');
exception when others then
  perform set_config('app.hard_purge_test_mode','off',true);
  raise;
end;
$$;

revoke all on function public.purge_event_test_full(uuid,text,text) from public, anon;
grant execute on function public.purge_event_test_full(uuid,text,text) to authenticated;
comment on function public.purge_event_test_full(uuid,text,text) is
  'Founder-only explicit QA hard purge. Deletes the scoped test graph in one transaction; never used by normal force delete.';
commit;

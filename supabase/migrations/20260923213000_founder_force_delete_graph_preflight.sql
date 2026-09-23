begin;

create or replace function public.preflight_purge_event_controlled(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public as $$
declare
  blockers jsonb := '[]'::jsonb;
  project_exists boolean;
  invalid_task_count integer;
begin
  select exists(select 1 from public.projects where id=p_project_id) into project_exists;
  if not project_exists then
    return jsonb_build_object('safe', true, 'status', 'ALREADY_DELETED', 'blockers', blockers);
  end if;

  -- The canonical tombstone retains project_id because the project itself is
  -- soft-deleted. This preserves tasks_scope_check without falsifying source_module.
  select count(*) into invalid_task_count
  from public.tasks t
  left join public.timeline_events e on e.id=t.timeline_reference
  where (t.project_id=p_project_id or e.project_id=p_project_id)
    and t.customer_id is null
    and t.project_id is null
    and t.source_module <> 'MANUAL';
  if invalid_task_count > 0 then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code','TASK_SCOPE_INVALID_BEFORE_PURGE',
      'count',invalid_task_count,
      'strategy','STOP_AND_REVIEW'));
  end if;

  return jsonb_build_object(
    'safe', jsonb_array_length(blockers)=0,
    'status','READY',
    'blockers',blockers,
    'preserve',jsonb_build_object(
      'timeline_events',(select count(*) from public.timeline_events where project_id=p_project_id),
      'timeline_tasks',(select count(*) from public.tasks where project_id=p_project_id and timeline_reference is not null),
      'timeline_communications',(select count(*) from public.timeline_events e join public.communications c on c.id=e.communication_id where c.project_id=p_project_id),
      'timeline_agreements',(select count(*) from public.timeline_events e join public.agreements a on a.id=e.agreement_id where a.project_id=p_project_id),
      'timeline_crm_events',(select count(*) from public.timeline_events e join public.crm_events ce on ce.id=e.crm_event_id where ce.project_id=p_project_id),
      'financial_history',true,
      'reservation_transactions',true),
    'strategy','SOFT_DELETE_PROJECT_PRESERVE_APPEND_ONLY_PARENTS');
end;
$$;

do $patch$
declare
  ddl text;
  task_delete constant text := 'delete from public.tasks where project_id=p_project_id;';
  previous_task_tombstone constant text := 'update public.tasks
      set project_id=null,
          orbit_event_id=null,
          status=''COMPLETED'',
          deleted_at=now(),
          updated_at=now(),
          metadata=metadata || jsonb_build_object(''sourceEventDeleted'', true, ''deletionReason'', ''SOURCE_EVENT_DELETED'')
      where project_id=p_project_id;';
  communication_delete constant text := 'delete from public.communications where project_id=p_project_id;';
  agreement_delete constant text := 'delete from public.agreements where project_id=p_project_id and signed_at is null and locked_at is null;';
begin
  select pg_get_functiondef('public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure) into ddl;
  if (position(task_delete in ddl)=0 and position(previous_task_tombstone in ddl)=0)
     or position(communication_delete in ddl)=0 or position(agreement_delete in ddl)=0 then
    raise exception 'Canonical purge function does not contain the expected pre-root-fix graph deletes';
  end if;
  ddl := replace(ddl, task_delete,
    $$update public.tasks
      set status='COMPLETED',
          deleted_at=now(),
          updated_at=now(),
          metadata=metadata || jsonb_build_object('sourceEventDeleted', true, 'deletionReason', 'SOURCE_EVENT_DELETED')
      where project_id=p_project_id;$$);
  ddl := replace(ddl, previous_task_tombstone,
    $$update public.tasks
      set status='COMPLETED',
          deleted_at=now(),
          updated_at=now(),
          metadata=metadata || jsonb_build_object('sourceEventDeleted', true, 'deletionReason', 'SOURCE_EVENT_DELETED')
      where project_id=p_project_id;$$);
  ddl := replace(ddl, communication_delete,
    $$update public.communications
      set project_id=null
      where project_id=p_project_id
        and exists (select 1 from public.timeline_events where communication_id=public.communications.id);
    delete from public.communications where project_id=p_project_id;$$);
  ddl := replace(ddl, agreement_delete,
    $$delete from public.agreements
      where project_id=p_project_id
        and signed_at is null and locked_at is null
        and not exists (select 1 from public.timeline_events where agreement_id=public.agreements.id);$$);
  ddl := replace(ddl,
    '  select exists(' || chr(10) || '    select 1 from public.invoice_payments',
    '  if not (public.preflight_purge_event_controlled(p_project_id)->>''safe'')::boolean then' || chr(10) || '    raise exception ''Founder purge preflight blocked: %'', public.preflight_purge_event_controlled(p_project_id);' || chr(10) || '  end if;' || chr(10) || chr(10) || '  select exists(' || chr(10) || '    select 1 from public.invoice_payments');
  execute ddl;
end $patch$;

comment on function public.preflight_purge_event_controlled(uuid) is
  'Read-only graph preflight for Founder Force Delete. Detects invalid task scope and reports append-only parents that must be preserved.';
comment on function public.purge_event_controlled(uuid,text,text,boolean) is
  'Canonical transactional Founder purge with graph preflight, valid task tombstones, and append-only historical parent preservation.';

revoke all on function public.preflight_purge_event_controlled(uuid) from public, anon;
grant execute on function public.preflight_purge_event_controlled(uuid) to authenticated;
commit;
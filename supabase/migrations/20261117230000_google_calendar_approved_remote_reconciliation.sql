alter table public.calendar_sync
  add column if not exists approved_remote_payload_hash text,
  add column if not exists approved_remote_source_hash text,
  add column if not exists approved_remote_etag text,
  add column if not exists approved_remote_snapshot jsonb,
  add column if not exists approved_remote_at timestamptz,
  add column if not exists approved_remote_by uuid references auth.users(id);

comment on column public.calendar_sync.approved_remote_payload_hash is
  'Official ORBIT fingerprint of a reviewed Google Calendar snapshot accepted without changing Calendar.';
comment on column public.calendar_sync.approved_remote_source_hash is
  'Canonical ORBIT fingerprint at the time the reviewed remote snapshot was accepted.';
comment on column public.calendar_sync.approved_remote_etag is
  'Google Calendar ETag of the accepted snapshot; any later remote version requires a new review.';

create or replace function public.accept_approved_calendar_remote_state(
  p_sync_id uuid,
  p_orbit_event_id text,
  p_expected_updated_at timestamptz,
  p_expected_current_hash text,
  p_source_hash text,
  p_remote_hash text,
  p_remote_etag text,
  p_remote_updated_at timestamptz,
  p_remote_snapshot jsonb,
  p_event_revision integer,
  p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sync public.calendar_sync%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_actor_id or not coalesce(public.can_administer(), false) then
    raise exception 'Calendar reconciliation requires an authenticated Founder/Admin.'
      using errcode = '42501';
  end if;

  if p_orbit_event_id not in ('ORB-2026-162036', 'ORB-2026-438017', 'ORB-2027-919683') then
    raise exception 'Calendar reconciliation is not enabled for this ORBIT Event ID.'
      using errcode = '22023';
  end if;

  if nullif(p_remote_etag, '') is null or p_remote_hash is null or p_source_hash is null then
    raise exception 'A verified ETag and calculated fingerprints are required.'
      using errcode = '22023';
  end if;

  select * into v_sync
  from public.calendar_sync
  where id = p_sync_id
  for update;

  if not found or v_sync.orbit_event_id <> p_orbit_event_id then
    raise exception 'The Calendar sync row no longer matches the requested ORBIT Event ID.'
      using errcode = '40001';
  end if;

  if v_sync.status = 'SYNCHRONIZED'
     and v_sync.approved_remote_etag = p_remote_etag
     and v_sync.approved_remote_payload_hash = p_remote_hash
     and v_sync.approved_remote_source_hash = p_source_hash then
    return 'ALREADY_ACCEPTED';
  end if;

  if v_sync.status <> 'UPDATE_REQUIRED'
     or v_sync.updated_at is distinct from p_expected_updated_at
     or v_sync.current_payload_hash is distinct from p_expected_current_hash
     or v_sync.current_payload_hash is distinct from p_source_hash then
    raise exception 'Calendar sync state changed during reconciliation; reload and review again.'
      using errcode = '40001';
  end if;

  if p_remote_snapshot->>'id' is distinct from coalesce(v_sync.nova_external_event_id, v_sync.external_event_id)
     or p_remote_snapshot->>'calendarId' is distinct from coalesce(v_sync.nova_calendar_id, '')
     or p_remote_snapshot->>'etag' is distinct from p_remote_etag then
    raise exception 'The accepted Calendar snapshot does not match the persisted event link, destination, or ETag.'
      using errcode = '40001';
  end if;

  update public.calendar_sync
  set status = 'SYNCHRONIZED',
      payload_hash = p_source_hash,
      current_payload_hash = p_source_hash,
      last_synced_payload_hash = p_remote_hash,
      last_synced_at = p_remote_updated_at,
      last_synced_event_revision = p_event_revision,
      current_event_revision = p_event_revision,
      approved_remote_payload_hash = p_remote_hash,
      approved_remote_source_hash = p_source_hash,
      approved_remote_etag = p_remote_etag,
      approved_remote_snapshot = p_remote_snapshot,
      approved_remote_at = now(),
      approved_remote_by = p_actor_id,
      last_error = null,
      last_error_code = null,
      retry_count = 0,
      next_retry_at = null,
      sync_started_at = null,
      updated_at = now()
  where id = p_sync_id;

  insert into public.audit_events(
    entity_type, entity_id, action, actor_id, reason,
    previous_state, new_state, orbit_event_id, occurred_at
  ) values (
    'GOOGLE_CALENDAR_RECONCILIATION',
    p_orbit_event_id,
    'REMOTE_STATE_ACCEPTED',
    p_actor_id,
    'Founder/Admin approved the verified remote Calendar snapshot without modifying the Google Calendar event.',
    jsonb_build_object(
      'status', v_sync.status,
      'currentPayloadHash', v_sync.current_payload_hash,
      'lastSyncedPayloadHash', v_sync.last_synced_payload_hash,
      'lastErrorCode', v_sync.last_error_code,
      'eventId', coalesce(v_sync.nova_external_event_id, v_sync.external_event_id),
      'calendarId', coalesce(v_sync.nova_calendar_id, '')
    ),
    jsonb_build_object(
      'status', 'SYNCHRONIZED',
      'sourceHash', p_source_hash,
      'remoteHash', p_remote_hash,
      'etag', p_remote_etag,
      'remoteSnapshot', p_remote_snapshot,
      'eventRevision', p_event_revision
    ),
    p_orbit_event_id,
    now()
  );

  return 'ACCEPTED';
end;
$$;

create or replace function public.flag_calendar_remote_reconciliation_conflict(
  p_sync_id uuid,
  p_orbit_event_id text,
  p_accepted_etag text,
  p_observed_etag text,
  p_observed_snapshot jsonb,
  p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sync public.calendar_sync%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_actor_id or not coalesce(public.can_administer(), false) then
    raise exception 'Calendar reconciliation requires an authenticated Founder/Admin.' using errcode = '42501';
  end if;
  select * into v_sync from public.calendar_sync where id = p_sync_id for update;
  if not found or v_sync.orbit_event_id <> p_orbit_event_id then
    raise exception 'Calendar sync row changed during reconciliation.' using errcode = '40001';
  end if;
  if v_sync.approved_remote_etag is distinct from p_accepted_etag then
    raise exception 'The accepted Calendar snapshot was superseded.' using errcode = '40001';
  end if;
  if v_sync.status = 'UPDATE_REQUIRED' and v_sync.last_error_code = 'REMOTE_EVENT_CHANGED' then return 'ALREADY_FLAGGED'; end if;
  update public.calendar_sync
  set status = 'UPDATE_REQUIRED', last_error_code = 'REMOTE_EVENT_CHANGED',
      last_error = jsonb_build_object('message', 'Google Calendar changed during the approved remote reconciliation; no Calendar write was attempted.'),
      updated_at = now()
  where id = p_sync_id;
  insert into public.audit_events(entity_type, entity_id, action, actor_id, reason, previous_state, new_state, orbit_event_id, occurred_at)
  values ('GOOGLE_CALENDAR_RECONCILIATION', p_orbit_event_id, 'REMOTE_CHANGED_DURING_ACCEPTANCE', p_actor_id,
    'Post-acceptance read detected a new Google Calendar version; the event was returned to review.',
    jsonb_build_object('status', v_sync.status, 'etag', p_accepted_etag),
    jsonb_build_object('status', 'UPDATE_REQUIRED', 'observedEtag', p_observed_etag, 'snapshot', p_observed_snapshot), p_orbit_event_id, now());
  return 'CONFLICT_FLAGGED';
end;
$$;

revoke all on function public.accept_approved_calendar_remote_state(
  uuid, text, timestamptz, text, text, text, text, timestamptz, jsonb, integer, uuid
) from public;
grant execute on function public.accept_approved_calendar_remote_state(
  uuid, text, timestamptz, text, text, text, text, timestamptz, jsonb, integer, uuid
) to authenticated;
revoke all on function public.flag_calendar_remote_reconciliation_conflict(uuid, text, text, text, jsonb, uuid) from public;
grant execute on function public.flag_calendar_remote_reconciliation_conflict(uuid, text, text, text, jsonb, uuid) to authenticated;

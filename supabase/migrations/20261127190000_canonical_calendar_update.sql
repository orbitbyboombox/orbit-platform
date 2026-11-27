create or replace function public.apply_canonical_calendar_event_update(
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
    raise exception 'Calendar canonical update requires an authenticated Founder/Admin.' using errcode = '42501';
  end if;
  if nullif(p_remote_etag, '') is null or p_source_hash is null or p_remote_hash is null then
    raise exception 'A verified ETag and calculated fingerprints are required.' using errcode = '22023';
  end if;

  select * into v_sync
  from public.calendar_sync
  where id = p_sync_id
  for update;

  if not found or v_sync.orbit_event_id <> p_orbit_event_id then
    raise exception 'The Calendar sync row does not match the requested ORBIT Event ID.' using errcode = '40001';
  end if;
  if v_sync.status = 'SYNCHRONIZED'
     and v_sync.current_payload_hash = p_source_hash
     and v_sync.last_synced_payload_hash = p_remote_hash
     and v_sync.approved_remote_etag = p_remote_etag then
    return 'ALREADY_SYNCHRONIZED';
  end if;
  if v_sync.status <> 'UPDATE_REQUIRED'
     or v_sync.updated_at is distinct from p_expected_updated_at
     or v_sync.current_payload_hash is distinct from p_expected_current_hash
     or v_sync.current_payload_hash is distinct from p_source_hash then
    raise exception 'Calendar sync state changed during canonical update; reload and retry.' using errcode = '40001';
  end if;
  if p_remote_snapshot->>'id' is distinct from coalesce(v_sync.nova_external_event_id, v_sync.external_event_id)
     or p_remote_snapshot->>'calendarId' is distinct from coalesce(v_sync.nova_calendar_id, '')
     or p_remote_snapshot->>'etag' is distinct from p_remote_etag then
    raise exception 'The canonical Calendar snapshot does not match the persisted event link, destination, or ETag.' using errcode = '40001';
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
    'GOOGLE_CALENDAR_RECONCILIATION', p_orbit_event_id, 'CANONICAL_STATE_PUSHED', p_actor_id,
    'Founder/Admin pushed the verified canonical ORBIT operational state to the existing Google Calendar event using ETag.',
    jsonb_build_object('status', v_sync.status, 'currentPayloadHash', v_sync.current_payload_hash,
      'lastSyncedPayloadHash', v_sync.last_synced_payload_hash, 'etag', p_remote_etag),
    jsonb_build_object('status', 'SYNCHRONIZED', 'sourceHash', p_source_hash,
      'remoteHash', p_remote_hash, 'etag', p_remote_etag, 'remoteSnapshot', p_remote_snapshot,
      'eventRevision', p_event_revision),
    p_orbit_event_id, now()
  );
  return 'SYNCHRONIZED';
end;
$$;

revoke all on function public.apply_canonical_calendar_event_update(
  uuid, text, timestamptz, text, text, text, text, timestamptz, jsonb, integer, uuid
) from public, anon;
grant execute on function public.apply_canonical_calendar_event_update(
  uuid, text, timestamptz, text, text, text, text, timestamptz, jsonb, integer, uuid
) to authenticated, service_role;

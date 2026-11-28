\set ON_ERROR_STOP on
\set admin_id '00000000-0000-0000-0000-000000000001'
\set readonly_id '00000000-0000-0000-0000-000000000002'
\set project_id '10000000-0000-0000-0000-000000000001'
\set sync_id '20000000-0000-0000-0000-000000000001'
\set sync_id_2 '20000000-0000-0000-0000-000000000002'
\set event_id 'ORB-TEST-370-001'
\set event_id_2 'ORB-TEST-370-002'

insert into auth.users(id) values (:'admin_id'), (:'readonly_id');
insert into public.profiles(id, role, display_name) values
  (:'admin_id', 'CEO', 'Synthetic Founder'),
  (:'readonly_id', 'READONLY', 'Synthetic Readonly');
insert into public.projects(id, customer_id, orbit_event_id, name, project_type, status, health)
values (:'project_id', gen_random_uuid(), :'event_id', 'Synthetic Calendar Event', 'PRIVATE', 'CONFIRMED', 'HEALTHY');
insert into public.calendar_sync(
  id, project_id, orbit_event_id, external_event_id, status, current_payload_hash,
  nova_external_event_id, nova_calendar_id, current_event_revision
) values (
  :'sync_id', :'project_id', :'event_id', 'remote-370-001', 'UPDATE_REQUIRED', 'source-hash-1',
  'remote-370-001', 'calendar-370', 1
);
insert into public.projects(id, customer_id, orbit_event_id, name, project_type, status, health)
values ('10000000-0000-0000-0000-000000000002', gen_random_uuid(), :'event_id_2', 'Synthetic Calendar Event 2', 'PRIVATE', 'CONFIRMED', 'HEALTHY');
insert into public.calendar_sync(
  id, project_id, orbit_event_id, external_event_id, status, current_payload_hash,
  nova_external_event_id, nova_calendar_id, current_event_revision
) values (
  :'sync_id_2', '10000000-0000-0000-0000-000000000002', :'event_id_2', 'remote-370-002', 'UPDATE_REQUIRED', 'source-hash-2',
  'remote-370-002', 'calendar-370', 1
);

select updated_at as expected_updated_at from public.calendar_sync where id = :'sync_id' \gset first_
select updated_at as expected_updated_at from public.calendar_sync where id = :'sync_id_2' \gset second_
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);

select public.apply_canonical_calendar_event_update(
  :'sync_id', :'event_id', :'first_expected_updated_at'::timestamptz, 'source-hash-1', 'source-hash-1', 'remote-hash-1', 'etag-1',
  '2026-11-27T12:00:00Z'::timestamptz, '{"id":"remote-370-001","calendarId":"calendar-370","etag":"etag-1"}'::jsonb, 2, :'admin_id'::uuid
);
select public.apply_canonical_calendar_event_update(
  :'sync_id', :'event_id', now(), 'source-hash-1', 'source-hash-1', 'remote-hash-1', 'etag-1',
  '2026-11-27T12:00:00Z'::timestamptz, '{"id":"remote-370-001","calendarId":"calendar-370","etag":"etag-1"}'::jsonb, 2, :'admin_id'::uuid
);

do $$
declare before_row jsonb; after_row jsonb; audit_count integer;
begin
  select to_jsonb(c) - 'updated_at' - 'created_at' into before_row from public.calendar_sync c where id = '20000000-0000-0000-0000-000000000001';
  begin
    perform public.apply_canonical_calendar_event_update(
      '20000000-0000-0000-0000-000000000001', 'WRONG-ID', now(), 'source-hash-1', 'source-hash-1', 'remote-hash-1', 'etag-1', now(),
      '{"id":"remote-370-001","calendarId":"calendar-370","etag":"etag-1"}'::jsonb, 2, '00000000-0000-0000-0000-000000000001'
    );
    raise exception 'wrong identity was accepted';
  exception when sqlstate '40001' then null;
  end;
  select to_jsonb(c) - 'updated_at' - 'created_at' into after_row from public.calendar_sync c where id = '20000000-0000-0000-0000-000000000001';
  if before_row <> after_row then raise exception 'rejected identity changed calendar_sync'; end if;
  select count(*) into audit_count from public.audit_events where action = 'CANONICAL_STATE_PUSHED' and orbit_event_id = 'ORB-TEST-370-001';
  if audit_count <> 1 then raise exception 'expected exactly one canonical audit row, got %', audit_count; end if;
end $$;

-- A remote snapshot can be confirmed for any active linked event, and a
-- repeated confirmation is idempotent even with the original optimistic token.
select updated_at as expected_updated_at from public.calendar_sync where id = :'sync_id_2' \gset accept_
select public.accept_approved_calendar_remote_state(
  :'sync_id_2', :'event_id_2', :'accept_expected_updated_at'::timestamptz, 'source-hash-2',
  'source-hash-2', 'remote-hash-2', 'etag-2', '2026-11-27T12:00:00Z'::timestamptz,
  '{"id":"remote-370-002","calendarId":"calendar-370","etag":"etag-2"}'::jsonb, 2, :'admin_id'::uuid
);
select public.accept_approved_calendar_remote_state(
  :'sync_id_2', :'event_id_2', :'accept_expected_updated_at'::timestamptz, 'source-hash-2',
  'source-hash-2', 'remote-hash-2', 'etag-2', '2026-11-27T12:00:00Z'::timestamptz,
  '{"id":"remote-370-002","calendarId":"calendar-370","etag":"etag-2"}'::jsonb, 2, :'admin_id'::uuid
);
do $$
begin
  if (select count(*) from public.audit_events where action = 'REMOTE_STATE_ACCEPTED' and orbit_event_id = 'ORB-TEST-370-002') <> 1 then
    raise exception 'remote confirmation was not audited exactly once';
  end if;
end $$;

select set_config('request.jwt.claim.sub', :'readonly_id', false);
do $$
begin
  perform public.apply_canonical_calendar_event_update(
    '20000000-0000-0000-0000-000000000002', 'ORB-TEST-370-002', now(), 'source-hash-2', 'source-hash-2', 'remote-hash-2', 'etag-2', now(),
    '{"id":"remote-370-002","calendarId":"calendar-370","etag":"etag-2"}'::jsonb, 2, '00000000-0000-0000-0000-000000000002'
  );
  raise exception 'readonly actor was accepted';
exception when sqlstate '42501' then null;
end $$;

select set_config('request.jwt.claim.sub', :'admin_id', false);
do $$
declare before_row jsonb; after_row jsonb;
begin
  select to_jsonb(c) - 'updated_at' - 'created_at' into before_row from public.calendar_sync c where id = '20000000-0000-0000-0000-000000000002';
  begin
    perform public.apply_canonical_calendar_event_update(
      '20000000-0000-0000-0000-000000000002', 'ORB-TEST-370-002', now(), 'source-hash-2', 'source-hash-2', 'remote-hash-2', 'wrong-etag', now(),
      '{"id":"remote-370-002","calendarId":"calendar-370","etag":"wrong-etag"}'::jsonb, 2, '00000000-0000-0000-0000-000000000001'
    );
    raise exception 'etag mismatch was accepted';
  exception when sqlstate '40001' then null;
  end;
  select to_jsonb(c) - 'updated_at' - 'created_at' into after_row from public.calendar_sync c where id = '20000000-0000-0000-0000-000000000002';
  if before_row <> after_row then raise exception 'rejected etag changed calendar_sync'; end if;
end $$;
reset role;
select 'isolated canonical calendar RPC checks passed' as result;

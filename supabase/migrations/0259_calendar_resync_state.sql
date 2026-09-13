alter table public.calendar_sync
  add column if not exists current_payload_hash text,
  add column if not exists last_synced_payload_hash text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists sync_started_at timestamptz,
  add column if not exists last_error_code text;

create index if not exists calendar_sync_resync_queue_idx
  on public.calendar_sync(status, next_retry_at, sync_started_at)
  where status in ('PENDING','STALE','FAILED','SYNCING');

create or replace function public.claim_calendar_sync_for_resync(p_sync_id uuid, p_now timestamptz default now())
returns boolean
language plpgsql security definer set search_path = public
as $$
declare claimed boolean;
begin
  update public.calendar_sync
     set status = 'SYNCING', sync_started_at = p_now, updated_at = p_now
   where id = p_sync_id
     and status in ('PENDING','STALE')
     and (next_retry_at is null or next_retry_at <= p_now)
  returning true into claimed;
  if claimed is true then return true; end if;
  update public.calendar_sync
     set status = 'SYNCING', sync_started_at = p_now, updated_at = p_now
   where id = p_sync_id
     and status = 'FAILED'
     and (next_retry_at is null or next_retry_at <= p_now)
     and (sync_started_at is null or sync_started_at < p_now - interval '10 minutes')
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_calendar_sync_for_resync(uuid,timestamptz) from public;
grant execute on function public.claim_calendar_sync_for_resync(uuid,timestamptz) to service_role;

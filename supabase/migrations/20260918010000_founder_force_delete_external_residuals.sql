begin;

alter table public.event_deletion_jobs
  drop constraint if exists event_deletion_jobs_status_check;

alter table public.event_deletion_jobs
  add constraint event_deletion_jobs_status_check
  check (status in (
    'REQUESTED',
    'REMOVED_FROM_OPERATION',
    'EXTERNAL_CLEANUP',
    'COMPLETED',
    'COMPLETED_WITH_EXTERNAL_RESIDUALS',
    'FAILED_RETRYABLE',
    'FAILED_MANUAL_ACTION_REQUIRED',
    'FAILED'
  ));

alter table public.event_deletion_jobs
  add column if not exists cleanup_residuals jsonb not null default '[]'::jsonb;

create index if not exists event_deletion_jobs_residual_idx
  on public.event_deletion_jobs(status)
  where status = 'COMPLETED_WITH_EXTERNAL_RESIDUALS';

commit;

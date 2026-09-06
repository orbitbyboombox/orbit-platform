begin;
-- Existing notification consumers use MEDIUM for normal commercial work.
-- Extend the legacy constraint rather than dropping that priority semantics.
alter table public.internal_notifications drop constraint if exists internal_notifications_priority_check;
alter table public.internal_notifications add constraint internal_notifications_priority_check
  check (priority in ('CRITICAL','HIGH','MEDIUM','NORMAL','INFORMATION'));
select public.reconcile_sales_pipeline_founder_alerts();
commit;

begin;

drop index if exists public.event_staff_payments_active_event_staff_idx;
create unique index if not exists event_staff_payments_active_event_scope_idx
  on public.event_staff_payments(project_id,staff_id)
  where block_id is null and deleted_at is null and status<>'CANCELLED';
create index if not exists event_staff_payments_active_block_scope_idx
  on public.event_staff_payments(project_id,staff_id,block_id)
  where block_id is not null and deleted_at is null and status<>'CANCELLED';

-- Legacy event-level settlements must never select or cancel a block-level ledger.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.refresh_staff_event_payment(uuid,uuid,uuid)'::regprocedure) into definition;
  definition:=replace(definition,
    'where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null',
    'where project_id=p_project_id and staff_id=p_staff_id and block_id is null and deleted_at is null');
  execute definition;
end $$;

commit;

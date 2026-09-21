begin;

-- Staff assignment requests are legacy-compatible: existing rows remain
-- event-level with a NULL block_id. New block-scoped requests may reference
-- an operational block, and blocks cannot be removed while referenced.
alter table public.staff_assignment_requests
  add column if not exists block_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.staff_assignment_requests'::regclass
      and conname = 'staff_assignment_requests_block_id_fkey'
  ) then
    alter table public.staff_assignment_requests
      add constraint staff_assignment_requests_block_id_fkey
      foreign key (block_id)
      references public.event_operational_blocks(id)
      on delete restrict;
  end if;
end $$;

create index if not exists staff_assignment_requests_block_idx
  on public.staff_assignment_requests(project_id, block_id, status, requested_at desc)
  where block_id is not null;

commit;

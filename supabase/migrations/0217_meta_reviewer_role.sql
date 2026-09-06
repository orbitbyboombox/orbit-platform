-- Restricted, read-only role for Meta App Review access to the communication hub.
alter type public.orbit_role add value if not exists 'META_REVIEWER';

-- PostgreSQL requires a committed transaction before a newly-added enum value
-- can be referenced by row-level policies.
commit;
begin;

create policy meta_reviewer_customers_read on public.customers
  for select using (public.current_orbit_role() = 'META_REVIEWER' and deleted_at is null);
create policy meta_reviewer_conversation_states_read on public.conversation_states
  for select using (public.current_orbit_role() = 'META_REVIEWER');
create policy meta_reviewer_communications_read on public.communications
  for select using (public.current_orbit_role() = 'META_REVIEWER');

commit;

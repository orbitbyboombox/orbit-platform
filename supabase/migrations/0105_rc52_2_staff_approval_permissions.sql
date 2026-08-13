begin;

-- The canonical approval RPC is SECURITY INVOKER so auth.uid() remains the
-- Founder who performed the review. 0090 intentionally revoked table access,
-- but restored only SELECT; SELECT ... FOR UPDATE and the review updates also
-- require UPDATE at the table level.
grant update on table public.staff_assignment_requests to authenticated;

drop policy if exists staff_assignment_requests_admin_update
  on public.staff_assignment_requests;
create policy staff_assignment_requests_admin_update
  on public.staff_assignment_requests
  for update
  to authenticated
  using (public.can_administer())
  with check (public.can_administer());

commit;

begin;

-- Cover every foreign-key lookup reported by the performance advisor. These
-- indexes are deliberately narrow because the module is read mostly by month.
create index if not exists office_lease_settings_created_by_idx on public.office_lease_settings(created_by);
create index if not exists office_lease_settings_updated_by_idx on public.office_lease_settings(updated_by);
create index if not exists office_lease_payments_obligation_idx on public.office_lease_payments(obligation_id);
create index if not exists office_lease_payments_created_by_idx on public.office_lease_payments(created_by);
create index if not exists office_lease_documents_settings_idx on public.office_lease_documents(settings_id);
create index if not exists office_lease_documents_payment_idx on public.office_lease_documents(payment_id);
create index if not exists office_lease_documents_created_by_idx on public.office_lease_documents(created_by);

-- The counter is mutated only from the guarded SECURITY DEFINER transaction.
-- Keep authenticated callers fail-closed while making that intent explicit.
create policy office_lease_receipt_counter_deny_direct_read
on public.office_lease_receipt_counter for select to authenticated
using (false);

commit;

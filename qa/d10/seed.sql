-- Synthetic-only D-10 worker fixture. Dates are relative to the runner's
-- database clock so the test remains deterministic without production data.
begin;

insert into public.customers (id, full_name, email, company, metadata)
values
  ('d1000000-0000-4000-8000-000000000001', 'D10 Synthetic Eligible', 'eligible@example.invalid', null, '{"record_type":"SYSTEM_CERTIFICATION"}'),
  ('d1000000-0000-4000-8000-000000000002', 'D10 Synthetic 30 Day', 'days30@example.invalid', 'Synthetic Corp', '{"record_type":"SYSTEM_CERTIFICATION"}'),
  ('d1000000-0000-4000-8000-000000000003', 'D10 Synthetic Paid', 'paid@example.invalid', null, '{"record_type":"SYSTEM_CERTIFICATION"}')
on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, company = excluded.company, metadata = excluded.metadata;

insert into public.projects (id, customer_id, orbit_event_id, name, project_type, status, health, event_date, location, city, operations)
values
  ('d1000000-0000-4000-8000-000000000011', 'd1000000-0000-4000-8000-000000000001', 'D10-SYN-ELIGIBLE', 'Synthetic eligible event', 'PRIVATE', 'CONFIRMED', 'HEALTHY', current_date + 10, 'QA venue', 'Santiago', '{}'),
  ('d1000000-0000-4000-8000-000000000012', 'd1000000-0000-4000-8000-000000000002', 'D10-SYN-30-DAY', 'Synthetic 30 day event', 'CORPORATE', 'CONFIRMED', 'HEALTHY', current_date + 10, 'QA venue', 'Santiago', '{}'),
  ('d1000000-0000-4000-8000-000000000013', 'd1000000-0000-4000-8000-000000000003', 'D10-SYN-PAID', 'Synthetic paid event', 'PRIVATE', 'CONFIRMED', 'HEALTHY', current_date + 10, 'QA venue', 'Santiago', '{}')
on conflict (id) do update set event_date = excluded.event_date, status = excluded.status, deleted_at = null;

-- The projection intentionally excludes record_origin=QA. These rows are still
-- synthetic and exist only inside the disposable local Supabase instance.
insert into public.invoices (id, invoice_number, customer_id, project_id, orbit_event_id, customer_type, status, issue_date, payment_term, amount, paid_amount, record_origin)
values
  ('d1000000-0000-4000-8000-000000000021', 'D10-SYN-INV-ELIGIBLE', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000011', 'D10-SYN-ELIGIBLE', 'PRIVATE', 'ISSUED', current_date, 'CASH', 100000, 20000, 'PRODUCTION'),
  ('d1000000-0000-4000-8000-000000000022', 'D10-SYN-INV-30-DAY', 'd1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000012', 'D10-SYN-30-DAY', 'CORPORATE', 'ISSUED', current_date, 'DAYS_30', 100000, 0, 'PRODUCTION'),
  ('d1000000-0000-4000-8000-000000000023', 'D10-SYN-INV-PAID', 'd1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000013', 'D10-SYN-PAID', 'PRIVATE', 'PAID', current_date, 'CASH', 100000, 100000, 'PRODUCTION')
on conflict (id) do update set paid_amount = excluded.paid_amount, status = excluded.status, issue_date = excluded.issue_date;

commit;

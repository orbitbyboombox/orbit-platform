alter table public.invoices drop constraint if exists invoices_record_origin_check;
alter table public.invoices add constraint invoices_record_origin_check check (record_origin = any (array['PRODUCTION'::text,'QA'::text,'PRE_SII'::text]));

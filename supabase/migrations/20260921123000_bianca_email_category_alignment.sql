begin;

alter table public.commercial_sends
  drop constraint if exists commercial_sends_category_check;

alter table public.commercial_sends
  add constraint commercial_sends_category_check check (
    category in ('QUOTE', 'CATALOG', 'COMMERCIAL_INFORMATION', 'COMPANIES_QUOTE', 'COMPANIES_CATALOG')
  );

commit;

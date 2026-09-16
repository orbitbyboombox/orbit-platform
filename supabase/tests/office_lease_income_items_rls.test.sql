begin;

select plan(5);

select ok(
  not has_table_privilege('anon','public.office_lease_income_items','select,insert,update,delete'),
  'anon has no access to classified office lease income'
);

select ok(
  has_table_privilege('authenticated','public.office_lease_income_items','select'),
  'authenticated has the select grant required before RLS evaluation'
);

select ok(
  not has_table_privilege('authenticated','public.office_lease_income_items','insert,update,delete'),
  'authenticated cannot mutate immutable income lines directly'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.office_lease_income_items'::regclass),
  'RLS is enabled'
);

select policies_are(
  'public','office_lease_income_items',array['office_lease_income_items_admin_select'],
  'only the Founder/Admin read policy is installed'
);

select * from finish();
rollback;

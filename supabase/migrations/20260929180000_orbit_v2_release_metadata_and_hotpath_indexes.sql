begin;

create index if not exists agreements_project_created_idx
  on public.agreements(project_id, created_at desc);

create index if not exists expenses_project_date_active_idx
  on public.expenses(project_id, occurred_on desc)
  where deleted_at is null and status <> 'CANCELLED';

update public.company_settings
   set product_version = 'v2.0',
       version = version + 1,
       approval_reason = 'ORBIT BOOMBOX v2.0 certified release',
       updated_at = now()
 where settings_key = 'PRIMARY'
   and product_version is distinct from 'v2.0';

commit;

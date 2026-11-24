begin;

-- Synthetic identities only; this script is executed against disposable local Supabase.
\set admin_id '''00000000-0000-4000-8000-000000000001'''
\set staff_id '''00000000-0000-4000-8000-000000000002'''
\set customer_id '''00000000-0000-4000-8000-000000000003'''
\set project_id '''00000000-0000-4000-8000-000000000004'''
\set request_key '''qa-consolidated-collection-001'''

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  (:'admin_id','authenticated','authenticated','qa-admin@example.invalid','',now(),now(),now()),
  (:'staff_id','authenticated','authenticated','qa-staff@example.invalid','',now(),now(),now());
insert into public.profiles(id,role,display_name)
values
  (:'admin_id','CEO','QA Founder'),
  (:'staff_id','STAFF','QA Staff');
insert into public.customers(id,full_name,email,rut)
values (:'customer_id','QA Customer','matias.maira.larrain@gmail.com','99.999.999-9');
insert into public.projects(id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,location,city,created_by,updated_by)
values (:'project_id',:'customer_id','ORB-QA-286-001','QA Consolidated Collection','CORPORATE','Confirmed','Healthy',current_date + 10,'12:00','QA','Santiago',:'admin_id',:'admin_id');
insert into public.invoices(invoice_number,customer_id,project_id,orbit_event_id,customer_type,status,issue_date,due_date,payment_term,amount,paid_amount,created_by,updated_by,financial_record_state,record_origin)
values ('QA-286-001',:'customer_id',:'project_id','ORB-QA-286-001','CORPORATE','PENDING',current_date - 30,current_date - 1,'DAYS_30',2618000,0,:'admin_id',:'admin_id','ACTIVE','PRODUCTION');

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select * from public.prepare_consolidated_collection(
  :'customer_id'::uuid,
  array[:'project_id'::uuid],
  :'request_key',
  'QA cobranza consolidada',
  '<p>QA premium</p>',
  'matias.maira.larrain@gmail.com',
  jsonb_build_object('qa', true, 'recipient', 'matias.maira.larrain@gmail.com')
);
select * from public.prepare_consolidated_collection(
  :'customer_id'::uuid,
  array[:'project_id'::uuid],
  :'request_key',
  'QA cobranza consolidada',
  '<p>QA premium</p>',
  'matias.maira.larrain@gmail.com',
  jsonb_build_object('qa', true, 'recipient', 'matias.maira.larrain@gmail.com')
);

do $$
declare communication_count integer;
begin
  select count(*) into communication_count
  from public.communications
  where project_id = '00000000-0000-4000-8000-000000000004'
    and communication_type = 'COLLECTION_EMAIL_CONSOLIDATED'
    and request_key = 'qa-consolidated-collection-001';
  if communication_count <> 1 then
    raise exception 'Expected one idempotent consolidated communication, got %', communication_count;
  end if;
end $$;

select set_config('request.jwt.claim.sub', :'staff_id', true);
do $$
begin
  begin
    perform * from public.prepare_consolidated_collection(
      '00000000-0000-4000-8000-000000000003'::uuid,
      array['00000000-0000-4000-8000-000000000004'::uuid],
      'qa-unauthorized', 'blocked', '<p>blocked</p>', 'matias.maira.larrain@gmail.com', '{}'::jsonb
    );
    raise exception 'Unauthorized staff call was allowed';
  exception when others then
    if sqlerrm = 'Unauthorized staff call was allowed' then raise; end if;
  end;
end $$;

rollback;

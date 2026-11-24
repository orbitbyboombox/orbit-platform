-- Browser-only fixture. Executed against disposable local Supabase after the
-- synthetic Founder user is created by the runner. No production identifiers.
\set admin_id :'qa_admin_id'
\set customer_id 00000000-0000-4000-8000-000000000003
\set project_id 00000000-0000-4000-8000-000000000004

insert into public.profiles(id,role,display_name)
values (:'admin_id'::uuid,'CEO','QA Founder')
on conflict (id) do update set role='CEO', display_name='QA Founder';

insert into public.customers(id,full_name,email,rut)
values (:'customer_id'::uuid,'QA Customer','matias.maira.larrain@gmail.com','99.999.999-9')
on conflict (id) do update set full_name=excluded.full_name,email=excluded.email,rut=excluded.rut;

insert into public.projects(id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,location,city,created_by,updated_by)
values (:'project_id'::uuid,:'customer_id'::uuid,'ORB-QA-286-001','QA Consolidated Collection','CORPORATE','Confirmed','Healthy',current_date + 10,'12:00','QA','Santiago',:'admin_id'::uuid,:'admin_id'::uuid)
on conflict (id) do update set customer_id=excluded.customer_id,name=excluded.name,status=excluded.status,event_date=excluded.event_date;

insert into public.invoices(invoice_number,customer_id,project_id,orbit_event_id,customer_type,status,issue_date,due_date,payment_term,amount,paid_amount,created_by,updated_by,financial_record_state,record_origin)
values ('QA-286-001',:'customer_id'::uuid,:'project_id'::uuid,'ORB-QA-286-001','CORPORATE','PENDING',current_date - 30,current_date - 1,'DAYS_30',2618000,0,:'admin_id'::uuid,:'admin_id'::uuid,'ACTIVE','PRODUCTION')
on conflict (invoice_number) do update set customer_id=excluded.customer_id,project_id=excluded.project_id,status='PENDING',amount=2618000,paid_amount=0,due_date=excluded.due_date,financial_record_state='ACTIVE';

select 'browser fixture ready' as status;

-- Browser-only fixture. Executed against disposable local Supabase after the
-- synthetic Founder user is created by the runner. No production identifiers.
\set glow_id 00000000-0000-4000-8000-000000000003
\set glow_project_old 00000000-0000-4000-8000-000000000004
\set glow_project_new 00000000-0000-4000-8000-000000000005
\set sp_id 00000000-0000-4000-8000-000000000006
\set sp_project 00000000-0000-4000-8000-000000000007

insert into public.profiles(id,role,display_name)
values (:'qa_admin_id'::uuid,'CEO','QA Founder')
on conflict (id) do update set role='CEO', display_name='QA Founder';

insert into public.customers(id,full_name,company,email,rut)
values
  (:'glow_id'::uuid,'Mariana Valenzuela','GLOW PRO COMPANY','matias.maira.larrain@gmail.com',null),
  (:'sp_id'::uuid,'Andrea Pérez','SP Wedding Planner Limitada','matias.maira.larrain@gmail.com',null)
on conflict (id) do update set full_name=excluded.full_name,company=excluded.company,email=excluded.email,rut=null;

insert into public.projects(id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,location,city,created_by,updated_by)
values
  (:'glow_project_old'::uuid,:'glow_id'::uuid,'ORB-QA-GLOW-001','GLOW PRO COMPANY — Matrimonio','CORPORATE','Confirmed','Healthy',current_date + 10,'12:00','QA','Santiago',:'qa_admin_id'::uuid,:'qa_admin_id'::uuid),
  (:'glow_project_new'::uuid,:'glow_id'::uuid,'ORB-QA-GLOW-002','GLOW PRO COMPANY — Activación','CORPORATE','Confirmed','Healthy',current_date + 30,'12:00','QA','Santiago',:'qa_admin_id'::uuid,:'qa_admin_id'::uuid),
  (:'sp_project'::uuid,:'sp_id'::uuid,'ORB-QA-SP-001','SP Wedding Planner Limitada — Evento','CORPORATE','Confirmed','Healthy',current_date + 15,'12:00','QA','Santiago',:'qa_admin_id'::uuid,:'qa_admin_id'::uuid)
on conflict (id) do update set customer_id=excluded.customer_id,name=excluded.name,status=excluded.status,event_date=excluded.event_date;

insert into public.invoices(invoice_number,customer_id,project_id,orbit_event_id,customer_type,status,issue_date,due_date,payment_term,amount,paid_amount,created_by,updated_by,financial_record_state,record_origin)
values
  ('QA-GLOW-001',:'glow_id'::uuid,:'glow_project_old'::uuid,'ORB-QA-GLOW-001','CORPORATE','PENDING',current_date - 52,current_date - 22,'DAYS_30',2618000,0,:'qa_admin_id'::uuid,:'qa_admin_id'::uuid,'ACTIVE','PRODUCTION'),
  ('QA-GLOW-002',:'glow_id'::uuid,:'glow_project_new'::uuid,'ORB-QA-GLOW-002','CORPORATE','PENDING',current_date - 5,'2099-01-01','DAYS_30',833000,0,:'qa_admin_id'::uuid,:'qa_admin_id'::uuid,'ACTIVE','PRODUCTION'),
  ('QA-SP-001',:'sp_id'::uuid,:'sp_project'::uuid,'ORB-QA-SP-001','CORPORATE','PENDING',current_date - 62,current_date - 17,'DAYS_45',1155000,0,:'qa_admin_id'::uuid,:'qa_admin_id'::uuid,'ACTIVE','PRODUCTION')
on conflict (invoice_number) do update set customer_id=excluded.customer_id,project_id=excluded.project_id,status='PENDING',amount=excluded.amount,paid_amount=0,due_date=excluded.due_date,financial_record_state='ACTIVE';

select 'browser fixture ready' as status;

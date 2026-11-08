-- Seed one isolated pending legacy CASE snapshot for independent concurrent RPC sessions.
\set ON_ERROR_STOP on
BEGIN;
DO $setup$
<<setup>>
DECLARE
  admin_id uuid := 'c3040000-0000-4000-8000-000000000001';
  customer_id uuid := 'c3040000-0000-4000-8000-000000000002';
  project_id uuid := 'c3040000-0000-4000-8000-000000000003';
  block_id uuid := 'c3040000-0000-4000-8000-000000000004';
  asset_id uuid := 'c3040000-0000-4000-8000-000000000005';
  assignment_id uuid := 'c3040000-0000-4000-8000-000000000006';
  operator_id uuid := 'c3040000-0000-4000-8000-000000000007';
BEGIN
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  VALUES(admin_id,'authenticated','authenticated','case03-race@example.invalid',
    crypt('not-used',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}')
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.profiles(id,role,display_name) VALUES(admin_id,'CEO','CASE-03 race test')
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.customers(id,full_name,email,created_by)
  VALUES(customer_id,'CASE-03 race test','case03-race-customer@example.invalid',admin_id);
  INSERT INTO public.projects(
    id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,
    location,city,operations,created_by
  ) VALUES(
    project_id,customer_id,'ORB-CASE03-RACE','CASE-03 race test',
    'EVENT','CONFIRMED','GREEN',current_date + 2,'09:00','Isolated QA venue','Santiago','{}'::jsonb,admin_id
  );
  INSERT INTO public.project_services(project_id,service_code,duration_hours,extras)
  VALUES(project_id,'CLASSIC',2,'[]'::jsonb);
  INSERT INTO public.event_operational_blocks(id,project_id,name,sequence,start_at,end_at)
  VALUES(block_id,project_id,'QA',1,date_trunc('minute',now())+interval '2 days',date_trunc('minute',now())+interval '2 days 2 hours');
  INSERT INTO public.staff(id,first_name,last_name,role,capabilities,status,portal_enabled,created_by)
  VALUES(operator_id,'Sebastián','Race','OPERATOR',ARRAY['OPERATOR'],'ACTIVE',true,admin_id);
  INSERT INTO public.assignments(project_id,block_id,staff_id,assignment_type,status,reason,created_by,updated_by)
  VALUES(project_id,block_id,operator_id,'OPERATOR','CONFIRMED','Synthetic source operator',admin_id,admin_id);
  INSERT INTO public.operational_assets(id,asset_code,asset_type,status,qr_key,metadata,created_by)
  VALUES(asset_id,'CASE-03-RACE','CASE','ASSIGNED','case03-race-qr',
    '{"blackBoxPhotoStock":390,"blackBoxPaperFormat":"4X6"}'::jsonb,admin_id);
  INSERT INTO public.asset_assignments(id,project_id,asset_id,assignment_status,assigned_by,reason,created_by,updated_by)
  VALUES(assignment_id,project_id,asset_id,'ASSIGNED',admin_id,'Synthetic race assignment',admin_id,admin_id);

  UPDATE public.event_paper_snapshots
  SET project_id=setup.project_id,orbit_event_id='ORB-CASE03-RACE',box_asset_id=setup.asset_id,
      media_lot_id=NULL,paper_required=true,opening_balance=390,status='PENDING',
      final_remaining_balance=NULL,event_usage=NULL,close_note='Revisar drive del PC'
  WHERE asset_assignment_id=setup.assignment_id;
  IF NOT FOUND THEN
    INSERT INTO public.event_paper_snapshots(
      project_id,orbit_event_id,asset_assignment_id,box_asset_id,media_lot_id,
      paper_required,opening_balance,status,close_note
    ) VALUES(
      setup.project_id,'ORB-CASE03-RACE',setup.assignment_id,setup.asset_id,NULL,true,390,'PENDING','Revisar drive del PC'
    );
  END IF;
END
$setup$;
COMMIT;

-- Legacy CASE administrative paper closeout regression; synthetic-only and rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';

DO $case03$
<<case03>>
DECLARE
  admin_id uuid := 'c3030000-0000-4000-8000-000000000001';
  customer_id uuid := 'c3030000-0000-4000-8000-000000000002';
  project_id uuid := 'c3030000-0000-4000-8000-000000000003';
  future_project_id uuid := 'c3030000-0000-4000-8000-000000000008';
  future_assignment_id uuid := 'c3030000-0000-4000-8000-000000000009';
  asset_id uuid := 'c3030000-0000-4000-8000-000000000004';
  assignment_id uuid := 'c3030000-0000-4000-8000-000000000005';
  operator_id uuid := 'c3030000-0000-4000-8000-000000000007';
  snapshot_id uuid := 'c3030000-0000-4000-8000-000000000006';
  call_key text := 'isolated-case03-mara-regression';
  close_note text := 'Operador Sebastián · restante declarado 352 · papel de repuesto NO · Revisar drive del PC';
  answer jsonb;
  movement_count integer;
  stock numeric;
  current_snapshot public.event_paper_snapshots%rowtype;
  assignment_status text;
  returned_at timestamptz;
BEGIN
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  VALUES(admin_id,'authenticated','authenticated','case03-test@example.invalid',
    crypt('not-used',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}')
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.profiles(id,role,display_name) VALUES(admin_id,'CEO','CASE-03 isolated test')
  ON CONFLICT(id) DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id::text,'role','authenticated')::text,true);

  INSERT INTO public.customers(id,full_name,email,created_by)
  VALUES(customer_id,'CASE-03 isolated test','case03-customer@example.invalid',admin_id);
  INSERT INTO public.projects(
    id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,
    location,city,operations,created_by
  ) VALUES(
    project_id,customer_id,'ORB-CASE03-ISOLATED','CASE-03 legacy paper closeout test',
    'EVENT','CONFIRMED','GREEN',current_date + 2,'09:00','Isolated QA venue','Santiago','{}'::jsonb,admin_id
  );
  INSERT INTO public.projects(
    id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,
    location,city,operations,created_by
  ) VALUES(
    future_project_id,customer_id,'ORB-CASE03-FUTURE','CASE-03 future snapshot test',
    'EVENT','CONFIRMED','GREEN',current_date + 3,'09:00','Isolated QA venue','Santiago','{}'::jsonb,admin_id
  );
  INSERT INTO public.project_services(project_id,service_code,duration_hours,extras)
  VALUES(project_id,'CLASSIC',2,'[]'::jsonb),(future_project_id,'CLASSIC',2,'[]'::jsonb);

  INSERT INTO public.operational_assets(id,asset_code,asset_type,status,qr_key,metadata,created_by)
  VALUES(asset_id,'CASE-03-ISOLATED','CASE','ASSIGNED','case03-isolated-qr',
    '{"blackBoxPhotoStock":390,"blackBoxPaperFormat":"4X6"}'::jsonb,admin_id);

  INSERT INTO public.staff(id,first_name,last_name,role,capabilities,status,portal_enabled,created_by)
  VALUES(operator_id,'Sebastián','Synthetic','OPERATOR',ARRAY['OPERATOR'],'ACTIVE',true,admin_id);
  INSERT INTO public.assignments(project_id,staff_id,assignment_type,status,reason,created_by,updated_by)
  VALUES(project_id,operator_id,'OPERATOR','CONFIRMED','Synthetic operator source assignment',admin_id,admin_id);

  INSERT INTO public.asset_assignments(id,project_id,asset_id,assignment_status,assigned_by,reason,created_by,updated_by)
  VALUES(assignment_id,project_id,asset_id,'ASSIGNED',admin_id,'Synthetic isolated closeout test',admin_id,admin_id);

  INSERT INTO public.asset_assignments(id,project_id,asset_id,assignment_status,assigned_by,reason,created_by,updated_by)
  VALUES(future_assignment_id,future_project_id,asset_id,'ASSIGNED',admin_id,'Synthetic future event assignment',admin_id,admin_id);

  UPDATE public.event_paper_snapshots
  SET project_id=future_project_id,orbit_event_id='ORB-CASE03-FUTURE',box_asset_id=asset_id,
      media_lot_id=NULL,paper_required=true,opening_balance=390,status='PENDING',
      final_remaining_balance=NULL,event_usage=NULL
  WHERE asset_assignment_id=future_assignment_id;
  IF NOT FOUND THEN
    INSERT INTO public.event_paper_snapshots(
      project_id,orbit_event_id,asset_assignment_id,box_asset_id,media_lot_id,
      paper_required,opening_balance,status
    ) VALUES(future_project_id,'ORB-CASE03-FUTURE',future_assignment_id,asset_id,NULL,true,390,'PENDING');
  END IF;

  INSERT INTO public.event_paper_snapshots(
    id,project_id,orbit_event_id,asset_assignment_id,box_asset_id,media_lot_id,
    paper_required,opening_balance,status,final_remaining_balance,event_usage,close_note
  ) VALUES(
    snapshot_id,project_id,'ORB-CASE03-ISOLATED',assignment_id,asset_id,NULL,
    true,390,'PENDING',NULL,NULL,close_note
  )
  ON CONFLICT(asset_assignment_id) DO UPDATE SET
    project_id=excluded.project_id,orbit_event_id=excluded.orbit_event_id,
    box_asset_id=excluded.box_asset_id,media_lot_id=NULL,paper_required=true,
    opening_balance=390,status='PENDING',final_remaining_balance=NULL,
    event_usage=NULL,close_note=excluded.close_note
  RETURNING id INTO snapshot_id;

  answer := public.admin_force_staff_event_paper_closeout(
    project_id,assignment_id,352,'Conciliación administrativa del reporte pendiente',call_key
  );
  IF answer->>'duplicate' <> 'false' OR answer->>'status' <> 'OVERRIDDEN'
     OR (answer->>'event_usage')::numeric <> 38
     OR (answer->>'master_stock_after')::numeric <> 352
     OR answer->>'movement_id' IS NULL THEN
    RAISE EXCEPTION 'First CASE-03 closeout result mismatch: %',answer;
  END IF;

  answer := public.admin_force_staff_event_paper_closeout(
    project_id,assignment_id,352,'Conciliación administrativa del reporte pendiente',call_key
  );
  IF answer->>'duplicate' <> 'true' THEN
    RAISE EXCEPTION 'Same-key retry was not idempotent: %',answer;
  END IF;

  SELECT count(*) INTO movement_count FROM public.inventory_movements im
  WHERE im.idempotency_key='staff-paper-admin-close:'||call_key
    AND im.project_id=case03.project_id AND im.movement_type='EVENT_USAGE'
    AND im.box_asset_id=case03.asset_id AND im.media_lot_id IS NULL
    AND im.supply_id IS NULL AND im.staff_id=operator_id AND im.quantity=-38
    AND im.quantity_before=390 AND im.quantity_delta=-38 AND im.quantity_after=352;
  IF movement_count <> 1 THEN RAISE EXCEPTION 'Expected exactly one legacy CASE movement; got %',movement_count; END IF;

  SELECT (metadata->>'blackBoxPhotoStock')::numeric INTO stock
  FROM public.operational_assets WHERE id=asset_id;
  IF stock <> 352 THEN RAISE EXCEPTION 'Master stock expected 352; got %',stock; END IF;

  SELECT * INTO current_snapshot FROM public.event_paper_snapshots WHERE id=snapshot_id;
  IF current_snapshot.status <> 'OVERRIDDEN'
     OR current_snapshot.final_remaining_balance <> 352
     OR current_snapshot.event_usage <> 38
     OR current_snapshot.close_note IS DISTINCT FROM close_note
     OR current_snapshot.confirmed_by IS NOT NULL THEN
    RAISE EXCEPTION 'Paper closure or report traceability mismatch: %',row_to_json(current_snapshot);
  END IF;

  SELECT aa.assignment_status,aa.returned_at INTO assignment_status,returned_at
  FROM public.asset_assignments aa WHERE aa.id=assignment_id;
  IF assignment_status <> 'ASSIGNED' OR returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Admin paper-only closeout changed the box assignment.';
  END IF;

  SELECT opening_balance INTO stock FROM public.event_paper_snapshots
  WHERE asset_assignment_id=future_assignment_id AND status='PENDING'
    AND final_remaining_balance IS NULL AND event_usage IS NULL;
  IF stock <> 352 THEN
    RAISE EXCEPTION 'Future pending snapshot was not reconciled to 352; got %',stock;
  END IF;
  SELECT aa.assignment_status,aa.returned_at INTO assignment_status,returned_at
  FROM public.asset_assignments aa WHERE aa.id=future_assignment_id;
  IF assignment_status <> 'ASSIGNED' OR returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Admin paper-only closeout changed the future assignment.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_movements im WHERE im.project_id=case03.future_project_id) THEN
    RAISE EXCEPTION 'Future event received an inventory movement before its closeout.';
  END IF;
END
$case03$;

ROLLBACK;

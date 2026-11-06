-- PR #183: isolated PostgreSQL AM/PM paper closeout integration fixture.
-- Uses the real schema/RPCs and synthetic rows only. The whole fixture rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '60s';

DO $fixture$
<<fixture_block>>
DECLARE
  ceo uuid := 'f1830000-0000-4000-8000-000000000001';
  customer_id uuid := 'f1830000-0000-4000-8000-000000000002';
  project_id uuid := 'f1830000-0000-4000-8000-000000000003';
  am_block uuid := 'f1830000-0000-4000-8000-000000000004';
  pm_block uuid := 'f1830000-0000-4000-8000-000000000005';
  supply_id uuid := 'f1830000-0000-4000-8000-000000000006';
  boxes uuid[] := '{}';
  printers uuid[] := '{}';
  am_staff uuid[] := '{}';
  pm_staff uuid[] := '{}';
  am_assignments uuid[] := '{}';
  pm_assignments uuid[] := '{}';
  asset_assignment_ids uuid[] := '{}';
  sessions uuid[] := '{}';
  box_id uuid;
  printer_id uuid;
  staff_id uuid;
  session_id uuid;
  assignment_id uuid;
  asset_assignment_id uuid;
  snapshot_id uuid;
  i integer;
  result jsonb;
  admin_result jsonb;
  admin_request uuid := 'f1830000-0000-4000-8000-000000000101';
  duplicate_result jsonb;
  rejected boolean;
  movements_before integer;
  movements_after integer;
  lot_before numeric;
  lot_after numeric;
  positions jsonb := '[]'::jsonb;
BEGIN
  INSERT INTO auth.users(id, aud, role, email, encrypted_password, email_confirmed_at,
                         raw_app_meta_data, raw_user_meta_data)
  VALUES (ceo, 'authenticated', 'authenticated', 'pr183-isolated@example.invalid',
          crypt('Pr183-Synthetic-Only!2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id, role, display_name)
  VALUES (ceo, 'CEO', 'PR183 Isolated CEO')
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', ceo::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',ceo::text,'role','authenticated')::text, true);

  INSERT INTO public.customers(id, full_name, email, created_by)
  VALUES (customer_id, 'PR183 Synthetic Customer', 'pr183-customer@example.invalid', ceo);
  INSERT INTO public.projects(
    id, customer_id, orbit_event_id, name, project_type, status, health,
    event_date, event_time, location, city, operations, created_by
  ) VALUES (
    project_id, customer_id, 'ORB-PR183-SYNTHETIC', 'PR183 Seven Box AM PM',
    'EVENT', 'CONFIRMED', 'GREEN', current_date + 1, '09:00',
    'Isolated QA Venue', 'Santiago', '{}'::jsonb, ceo
  );
  INSERT INTO public.project_services(project_id, service_code, duration_hours, extras)
  VALUES (project_id, 'CLASSIC', 4.5, '[]'::jsonb);
  INSERT INTO public.event_operational_blocks(id, project_id, name, sequence, start_at, end_at)
  VALUES
    (am_block, project_id, 'AM', 1, date_trunc('minute',now()) + interval '1 days', date_trunc('minute',now()) + interval '1 days 4 hours 30 minutes'),
    (pm_block, project_id, 'PM', 2, date_trunc('minute',now()) + interval '1 days 6 hours', date_trunc('minute',now()) + interval '1 days 10 hours 30 minutes');

  INSERT INTO public.supplies(
    id, name, purchase_price, vat_included, unit, calculation_method, status,
    catalog_code, current_stock, stock_status, created_by
  ) VALUES (
    supply_id, 'PR183 Synthetic Paper', 1, false, 'PHOTO', 'UNIT', 'ACTIVE',
    'pr183-synthetic-paper', 14000, 'NORMAL', ceo
  );
  INSERT INTO public.box_media_formats(format_key, label, width_mm, height_mm)
  VALUES ('PR183_FORMAT', 'PR183 format', 100, 150)
  ON CONFLICT (format_key) DO NOTHING;

  FOR i IN 1..7 LOOP
    box_id := gen_random_uuid();
    printer_id := gen_random_uuid();
    IF i=7 THEN
      SELECT id INTO box_id FROM public.operational_assets WHERE asset_code='CASE-07' AND deleted_at IS NULL;
      IF box_id IS NULL THEN RAISE EXCEPTION 'Synthetic CASE-07 master asset is missing'; END IF;
      UPDATE public.operational_assets
         SET metadata=jsonb_build_object('blackBoxPhotoStock',1000,'blackBoxPaperFormat','PR183_FORMAT','name','PR183 CASE-07')
       WHERE id=box_id;
    ELSE
      INSERT INTO public.operational_assets(id, asset_code, asset_type, status, qr_key, created_by)
      VALUES (box_id, format('PR183-BOX-%s', lpad(i::text,2,'0')), 'BOX', 'ASSIGNED', format('pr183:box:%s',i), ceo);
    END IF;
    INSERT INTO public.operational_assets(id, asset_code, asset_type, status, qr_key, parent_asset_id, created_by)
    VALUES (printer_id, format('PR183-PRINTER-%s', lpad(i::text,2,'0')), 'PRINTER', 'ASSIGNED', format('pr183:printer:%s',i), box_id, ceo);
    IF i<7 THEN
      INSERT INTO public.box_media_lots(
        supply_id, box_asset_id, printer_asset_id, format_key, lot,
        initial_photo_capacity, remaining_photo_capacity, created_by
      ) VALUES (supply_id, box_id, printer_id, 'PR183_FORMAT', format('PR183-LOT-%s',i), 1000, 1000, ceo);
    END IF;
    boxes := boxes || box_id;
    printers := printers || printer_id;

    staff_id := gen_random_uuid();
    INSERT INTO public.staff(id, first_name, last_name, role, capabilities, status,
                             portal_enabled, created_by)
    VALUES (staff_id, 'PR183', format('AM-%s',i), 'OPERATOR',
            ARRAY['OPERATOR'], 'ACTIVE', true, ceo);
    am_staff := am_staff || staff_id;
    session_id := gen_random_uuid();
    INSERT INTO public.portal_access_sessions(id, access_type, token_hash, staff_id,
                                              ip_hash, expires_at)
    VALUES (session_id, 'STAFF', encode(digest(session_id::text,'sha256'),'hex'),
            staff_id, 'pr183', now() + interval '2 hours');
    sessions := sessions || session_id;

    staff_id := gen_random_uuid();
    INSERT INTO public.staff(id, first_name, last_name, role, capabilities, status,
                             portal_enabled, created_by)
    VALUES (staff_id, 'PR183', format('PM-%s',i), 'OPERATOR',
            ARRAY['OPERATOR'], 'ACTIVE', true, ceo);
    pm_staff := pm_staff || staff_id;
    session_id := gen_random_uuid();
    INSERT INTO public.portal_access_sessions(id, access_type, token_hash, staff_id,
                                              ip_hash, expires_at)
    VALUES (session_id, 'STAFF', encode(digest(session_id::text,'sha256'),'hex'),
            staff_id, 'pr183', now() + interval '2 hours');
    sessions := sessions || session_id;

    am_assignments := am_assignments || gen_random_uuid();
    pm_assignments := pm_assignments || gen_random_uuid();
    INSERT INTO public.assignments(id, project_id, block_id, staff_id, assignment_type,
                                   status, reason, created_by, updated_by)
    VALUES
      (am_assignments[i], project_id, am_block, am_staff[i], 'OPERATOR', 'CONFIRMED', 'PR183 AM fixture', ceo, ceo),
      (pm_assignments[i], project_id, pm_block, pm_staff[i], 'OPERATOR', 'CONFIRMED', 'PR183 PM fixture', ceo, ceo);

    INSERT INTO public.asset_assignments(id, project_id, asset_id, assignment_status,
                                         assigned_by, reason, created_by, updated_by)
    VALUES (gen_random_uuid(), project_id, box_id, 'ASSIGNED', ceo, 'PR183 box fixture', ceo, ceo)
    RETURNING id INTO asset_assignment_id;
    asset_assignment_ids := asset_assignment_ids || asset_assignment_id;
    SELECT s.id INTO snapshot_id FROM public.event_paper_snapshots s WHERE s.asset_assignment_id=asset_assignment_ids[i];
    IF snapshot_id IS NULL THEN RAISE EXCEPTION 'Paper snapshot missing for box %', i; END IF;

    positions := positions || jsonb_build_array(jsonb_build_object(
      'id', format('qa-position-%s',i), 'label', format('QA Caja %s',i), 'location', 'Recinto sintético', 'reference', 'QA aislada', 'assetId', box_id::text,
      'blocks', jsonb_build_array(
        jsonb_build_object('blockId', am_block::text, 'assignmentId', am_assignments[i]::text),
        jsonb_build_object('blockId', pm_block::text, 'assignmentId', pm_assignments[i]::text)
      )
    ));
  END LOOP;
  UPDATE public.projects SET operations=jsonb_build_object('totemLayout',jsonb_build_object('enabled',true,'positions',positions)) WHERE id=fixture_block.project_id;

END $fixture$;
UPDATE auth.users SET instance_id='00000000-0000-0000-0000-000000000000', confirmation_token='', recovery_token='', email_change_token_new='', email_change='', created_at=now(),updated_at=now() WHERE id='f1830000-0000-4000-8000-000000000001';
UPDATE public.staff SET portal_password_change_required=false WHERE first_name='PR183';
COMMIT;

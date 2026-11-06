-- PR #183: isolated PostgreSQL AM/PM paper closeout integration fixture.
-- Uses the real schema/RPCs and synthetic rows only. The whole fixture rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '60s';

DO $fixture$
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
          crypt('not-used', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}')
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
    'EVENT', 'CONFIRMED', 'GREEN', current_date + 30, '09:00',
    'Isolated QA Venue', 'Santiago', '{}'::jsonb, ceo
  );
  INSERT INTO public.project_services(project_id, service_code, duration_hours, extras)
  VALUES (project_id, 'CLASSIC', 4.5, '[]'::jsonb);
  INSERT INTO public.event_operational_blocks(id, project_id, name, sequence, start_at, end_at)
  VALUES
    (am_block, project_id, 'AM', 1, date_trunc('minute',now()) + interval '30 days', date_trunc('minute',now()) + interval '30 days 4 hours 30 minutes'),
    (pm_block, project_id, 'PM', 2, date_trunc('minute',now()) + interval '30 days 6 hours', date_trunc('minute',now()) + interval '30 days 10 hours 30 minutes');

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
    INSERT INTO public.operational_assets(id, asset_code, asset_type, status, qr_key, created_by)
    VALUES (box_id, format('PR183-BOX-%s', lpad(i::text,2,'0')), 'BOX', 'ASSIGNED', format('pr183:box:%s',i), ceo);
    INSERT INTO public.operational_assets(id, asset_code, asset_type, status, qr_key, parent_asset_id, created_by)
    VALUES (printer_id, format('PR183-PRINTER-%s', lpad(i::text,2,'0')), 'PRINTER', 'ASSIGNED', format('pr183:printer:%s',i), box_id, ceo);
    INSERT INTO public.box_media_lots(
      supply_id, box_asset_id, printer_asset_id, format_key, lot,
      initial_photo_capacity, remaining_photo_capacity, created_by
    ) VALUES (supply_id, box_id, printer_id, 'PR183_FORMAT', format('PR183-LOT-%s',i), 1000, 1000, ceo);
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
    SELECT s.id INTO snapshot_id FROM public.event_paper_snapshots s WHERE s.asset_assignment_id=asset_assignment_id;
    IF snapshot_id IS NULL THEN RAISE EXCEPTION 'Paper snapshot missing for box %', i; END IF;

    positions := positions || jsonb_build_array(jsonb_build_object(
      'assetId', box_id::text,
      'blocks', jsonb_build_array(
        jsonb_build_object('blockId', am_block::text, 'assignmentId', am_assignments[i]::text),
        jsonb_build_object('blockId', pm_block::text, 'assignmentId', pm_assignments[i]::text)
      )
    ));
  END LOOP;
  UPDATE public.projects SET operations=jsonb_build_object('totemLayout',jsonb_build_object('positions',positions)) WHERE id=project_id;

  -- PM cannot close before AM.
  rejected := false;
  BEGIN
    PERFORM public.record_staff_paper_block_closeout(
      project_id, pm_block, pm_assignments[1], 900, 20, 850,
      gen_random_uuid(), pm_staff[1], sessions[2]
    );
  EXCEPTION WHEN OTHERS THEN rejected := position('bloque anterior' in lower(sqlerrm)) > 0; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PM-before-AM was not rejected'; END IF;

  -- A block/box mismatch must fail closed against the canonical layout.
  UPDATE public.projects
     SET operations = jsonb_set(
       jsonb_set(operations, '{totemLayout,positions,0,blocks,0,blockId}', to_jsonb(pm_block::text)),
       '{totemLayout,positions,0,assetId}', to_jsonb(printers[1]::text)
     )
   WHERE id = project_id;
  rejected := false;
  BEGIN
    PERFORM public.record_staff_paper_block_closeout(
      project_id, am_block, am_assignments[1], 1000, 50, 900,
      gen_random_uuid(), am_staff[1], sessions[1]
    );
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Wrong canonical box/block was not rejected'; END IF;
  UPDATE public.projects SET operations=jsonb_build_object('totemLayout',jsonb_build_object('positions',positions)) WHERE id=project_id;

  -- AM closes for all seven boxes. Each receives one synthetic reload.
  FOR i IN 1..7 LOOP
    INSERT INTO public.event_paper_reloads(
      snapshot_id, project_id, asset_assignment_id, media_lot_id, quantity,
      staff_id, portal_session_id, idempotency_key
    )
    SELECT s.id, project_id, asset_assignment_ids[i], s.media_lot_id, 50,
           am_staff[i], sessions[(i-1)*2+1], format('pr183-am-reload-%s',i)
    FROM public.event_paper_snapshots s
    WHERE s.asset_assignment_id=asset_assignment_ids[i];
    UPDATE public.box_media_lots SET remaining_photo_capacity=remaining_photo_capacity+50
    WHERE box_asset_id=boxes[i];
    result := public.record_staff_paper_block_closeout(
      project_id, am_block, am_assignments[i], 1000, 50, 900,
      gen_random_uuid(), am_staff[i], sessions[(i-1)*2+1]
    );
    IF (result->>'status') <> 'CLOSED' OR (result->>'used')::integer <> 150 THEN
      RAISE EXCEPTION 'AM closeout mismatch for box %: %', i, result;
    END IF;
  END LOOP;

  -- PM receives exactly AM remaining, then gets an additional reload through the
  -- canonical reload ledger and closes at 850. It must reconcile one movement.
  FOR i IN 1..7 LOOP
    SELECT id INTO snapshot_id FROM public.event_paper_snapshots WHERE asset_assignment_id=asset_assignment_ids[i];
    PERFORM public.record_staff_event_paper_reload(
      project_id, asset_assignment_ids[i], 20, 'PR183 PM reload',
      format('pr183-pm-reload-%s',i), pm_staff[i], sessions[(i-1)*2+2]
    );
    result := public.record_staff_paper_block_closeout(
      project_id, pm_block, pm_assignments[i], 900, 20, 850,
      gen_random_uuid(), pm_staff[i], sessions[(i-1)*2+2]
    );
    IF (result->>'status') <> 'CLOSED' OR (result->>'inventory_reconciled') <> 'true' THEN
      RAISE EXCEPTION 'PM closeout did not reconcile for box %: %', i, result;
    END IF;
  END LOOP;

  SELECT count(*) INTO movements_after FROM public.inventory_movements m
  WHERE m.project_id=project_id AND m.movement_type='EVENT_USAGE';
  IF movements_after <> 7 THEN RAISE EXCEPTION 'Expected one EVENT_USAGE per box, got %', movements_after; END IF;
  SELECT count(*) INTO movements_before FROM public.event_box_paper_block_closeouts c
  WHERE c.project_id=project_id AND c.inventory_reconciled_at IS NOT NULL;
  IF movements_before <> 7 THEN RAISE EXCEPTION 'Expected seven reconciled PM closeouts, got %', movements_before; END IF;
  SELECT count(*) INTO movements_before FROM public.box_media_lots l
  WHERE l.box_asset_id=ANY(boxes) AND l.remaining_photo_capacity=850;
  IF movements_before <> 7 THEN RAISE EXCEPTION 'Master inventory did not end at 850 for all boxes'; END IF;

  -- Same request is idempotent; changed payload with same request is rejected.
  result := public.record_staff_paper_block_closeout(
    project_id, am_block, am_assignments[1], 1000, 50, 900,
    (SELECT c.request_id FROM public.event_box_paper_block_closeouts c WHERE c.project_id=project_id AND c.block_id=am_block LIMIT 1),
    am_staff[1], sessions[1]
  );
  IF (result->>'duplicate') <> 'true' THEN RAISE EXCEPTION 'AM retry was not idempotent'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.record_staff_paper_block_closeout(
      project_id, am_block, am_assignments[1], 1000, 50, 899,
      (SELECT c.request_id FROM public.event_box_paper_block_closeouts c WHERE c.project_id=project_id AND c.block_id=am_block LIMIT 1),
      am_staff[1], sessions[1]
    );
  EXCEPTION WHEN OTHERS THEN rejected := position('ya existe' in lower(sqlerrm)) > 0 OR position('solicitud duplicada' in lower(sqlerrm)) > 0; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Contradictory retry was not rejected'; END IF;

  -- Wrong operator and wrong block/canonical layout are rejected.
  rejected := false;
  BEGIN
    PERFORM public.record_staff_paper_block_closeout(project_id, am_block, am_assignments[1], 1000, 50, 900,
      gen_random_uuid(), pm_staff[1], sessions[2]);
  EXCEPTION WHEN OTHERS THEN rejected := position('no pertenece' in lower(sqlerrm)) > 0; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Wrong operator was not rejected'; END IF;

  RAISE NOTICE 'PASS: seven boxes, fourteen AM/PM closeouts, PM handoff, reloads, inventory, idempotency and authorization.';
END;
$fixture$;
ROLLBACK;

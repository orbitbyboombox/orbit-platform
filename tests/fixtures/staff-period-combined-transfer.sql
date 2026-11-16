-- Isolated regression for the post-close combined Staff transfer.
-- Synthetic rows only; the transaction is rolled back at the end.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '60s';

DO $fixture$
DECLARE
  actor uuid := 'f2390000-0000-4000-8000-000000000001';
  customer_id uuid := 'f2390000-0000-4000-8000-000000000002';
  project_id uuid := 'f2390000-0000-4000-8000-000000000003';
  assignment_id uuid := 'f2390000-0000-4000-8000-000000000004';
  staff_id uuid := 'f2390000-0000-4000-8000-000000000005';
  settlement_id uuid := 'f2390000-0000-4000-8000-000000000006';
  account_id uuid := 'f2390000-0000-4000-8000-000000000007';
  schedule_id uuid := account_id;
  period_id uuid := 'f2390000-0000-4000-8000-000000000008';
  expense_food uuid := 'f2390000-0000-4000-8000-000000000009';
  expense_video uuid := 'f2390000-0000-4000-8000-00000000000a';
  submission_food uuid := 'f2390000-0000-4000-8000-00000000000b';
  submission_video uuid := 'f2390000-0000-4000-8000-00000000000c';
  first jsonb;
  retry jsonb;
  snapshot_before jsonb;
  snapshot_after jsonb;
  payment_count integer;
  reimbursement_count integer;
  movement_count integer;
  withholding numeric;
  target_assignment_id uuid := assignment_id;
BEGIN
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  VALUES(actor,'authenticated','authenticated','pr239-admin@example.invalid',crypt('unused',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}')
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.profiles(id,role,display_name) VALUES(actor,'CEO','PR239 isolated admin') ON CONFLICT(id) DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor::text,'role','authenticated')::text,true);

  INSERT INTO public.customers(id,full_name,email,created_by)
  VALUES(customer_id,'PR239 synthetic customer','pr239-customer@example.invalid',actor);
  INSERT INTO public.projects(id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,location,city,operations,created_by)
  VALUES(project_id,customer_id,'ORB-PR239-SYNTHETIC','PR239 combined transfer','EVENT','COMPLETED','GREEN','2026-11-10','09:00','Isolated QA','Santiago','{}',actor);
  INSERT INTO public.project_services(project_id,service_code,duration_hours,extras)
  VALUES(project_id,'PHOTOBOOTH',4,'{}');
  INSERT INTO public.staff(id,first_name,last_name,role,capabilities,status,portal_enabled,created_by)
  VALUES(staff_id,'PR239','Synthetic','OPERATOR',ARRAY['OPERATOR'],'ACTIVE',true,actor);
  INSERT INTO public.assignments(id,project_id,staff_id,assignment_type,status,reason,created_by,updated_by)
  VALUES(assignment_id,project_id,staff_id,'OPERATOR','CONFIRMED','PR239 fixture',actor,actor);
  SELECT id INTO settlement_id
  FROM public.event_staff_payments AS ep
  WHERE ep.assignment_id=target_assignment_id AND ep.deleted_at IS NULL
  ORDER BY ep.created_at DESC
  LIMIT 1;
  IF settlement_id IS NULL THEN RAISE EXCEPTION 'Assignment payment was not materialized'; END IF;
  UPDATE public.event_staff_payments
  SET contracted_hours=4, contracted_minutes=240, operator_payment=400000,
      automatic_operator_payment=400000, status='CONFIRMED', updated_by=actor
  WHERE id=settlement_id;
  INSERT INTO public.staff_monthly_accounts(id,staff_id,accounting_month,expected_amount,boleta_status,payment_status,work_net,boleta_net,withholding_rate,withholding_amount,final_transfer_amount,settlement_status)
  VALUES(account_id,staff_id,'2026-11-01',400000,'APPROVED','READY_TO_PAY',400000,400000,15.25,0,400000,'DRAFT');
  INSERT INTO public.staff_payment_schedules(account_id,modality,monthly_boleta_validation,validated_by,validated_at,created_by)
  VALUES(schedule_id,'QUINCENAL','pr239-validacion',actor,now(),actor);
  INSERT INTO public.staff_payment_periods(id,account_id,period_code,starts_on,ends_on,status)
  VALUES(period_id,account_id,'Q1','2026-11-01','2026-11-14','DRAFT');
  INSERT INTO public.expenses(id,project_id,category,occurred_on,subtotal,vat,total,currency,receipt_path,status,responsible_staff_id,event_staff_settlement_id,idempotency_key,approval_reason,created_by,updated_by,approved_by,approved_at)
  VALUES(expense_food,project_id,'OTHER_OPERATIONAL','2026-11-10',6000,0,6000,'CLP','pr239/food.pdf','APPROVED',staff_id,settlement_id,'pr239-expense-food','fixture',actor,actor,actor,now()),
        (expense_video,project_id,'OTHER_OPERATIONAL','2026-11-10',10000,0,10000,'CLP','pr239/video.pdf','APPROVED',staff_id,settlement_id,'pr239-expense-video','fixture',actor,actor,actor,now());
  INSERT INTO public.staff_expense_submissions(id,staff_id,project_id,category,amount,occurred_on,receipt_path,status,reimbursement,materialized_expense_id,idempotency_key)
  VALUES(submission_food,staff_id,project_id,'FOOD',6000,'2026-11-10','pr239/food.pdf','APPROVED',true,expense_food,'pr239-submission-food'),
        (submission_video,staff_id,project_id,'OTHER',10000,'2026-11-10','pr239/video.pdf','APPROVED',true,expense_video,'pr239-submission-video');

  SELECT public.staff_payment_period_calculation(period_id) INTO first;
  IF (first->>'workPending')::numeric <> 400000 THEN RAISE EXCEPTION 'Expected Q1 honoraria 400000, got %',first; END IF;
  UPDATE public.staff_payment_periods SET status='FINALIZED',snapshot=first,closed_by=actor,closed_at=now() WHERE id=period_id;
  SELECT snapshot INTO snapshot_before FROM public.staff_payment_periods WHERE id=period_id;

  first := public.register_staff_period_transfer(period_id,416000,'2026-11-16','BCI','55611659','pr239-transfer-55611659','orbit-documents','staff/pr239/transfer.pdf','transfer.pdf','application/pdf');
  IF (first->>'honoraria')::numeric <> 400000 OR (first->>'reimbursements')::numeric <> 16000 OR (first->>'total')::numeric <> 416000 THEN
    RAISE EXCEPTION 'Combined transfer distribution mismatch: %',first;
  END IF;
  SELECT snapshot INTO snapshot_after FROM public.staff_payment_periods WHERE id=period_id;
  IF snapshot_after IS DISTINCT FROM snapshot_before THEN RAISE EXCEPTION 'FINALIZED snapshot changed'; END IF;
  SELECT withholding_amount INTO withholding FROM public.staff_period_payments WHERE period_id=period_id;
  IF withholding IS NULL OR withholding < 0 THEN RAISE EXCEPTION 'Period payment not persisted correctly'; END IF;
  SELECT count(*) INTO payment_count FROM public.staff_period_payments WHERE period_id=period_id;
  SELECT count(*) INTO reimbursement_count FROM public.staff_reimbursement_payments WHERE staff_id=staff_id AND notes='55611659';
  SELECT count(*) INTO movement_count FROM public.event_staff_settlement_movements WHERE settlement_id=settlement_id AND movement_type='PAYMENT';
  IF payment_count<>1 OR reimbursement_count<>2 OR movement_count<>1 THEN RAISE EXCEPTION 'Unexpected row counts: payment %, reimbursements %, movements %',payment_count,reimbursement_count,movement_count; END IF;

  retry := public.register_staff_period_transfer(period_id,416000,'2026-11-16','BCI','55611659','pr239-transfer-55611659','orbit-documents','staff/pr239/transfer.pdf','transfer.pdf','application/pdf');
  IF coalesce((retry->>'idempotent')::boolean,false) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Retry was not idempotent: %',retry; END IF;
  IF (SELECT count(*) FROM public.staff_period_payments WHERE period_id=period_id)<>1 OR (SELECT count(*) FROM public.staff_reimbursement_payments WHERE staff_id=staff_id AND notes='55611659')<>2 THEN
    RAISE EXCEPTION 'Idempotent retry duplicated rows';
  END IF;
  RAISE NOTICE 'PASS: combined transfer 400000 honoraria + 6000 + 10000 reimbursements, FINALIZED snapshot protected, idempotent retry, transaction rollback';
END;
$fixture$;
ROLLBACK;
\echo 'PASS: PR239 isolated combined Staff transfer fixture rolled back without production writes.'

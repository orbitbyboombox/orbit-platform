-- PR #183: real PostgreSQL catalog/security integration checks.
-- Run ONLY on isolated local Supabase; never against production.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  staff_fn regprocedure := to_regprocedure('public.record_staff_paper_block_closeout(uuid,uuid,uuid,integer,integer,integer,uuid,uuid,uuid)');
  admin_fn regprocedure := to_regprocedure('public.admin_record_staff_paper_block_closeout(uuid,uuid,uuid,integer,integer,integer,uuid,uuid,text)');
  target_table regclass := to_regclass('public.event_box_paper_block_closeouts');
  audit_table regclass := to_regclass('public.event_paper_block_admin_audit');
BEGIN
  IF staff_fn IS NULL OR admin_fn IS NULL THEN
    RAISE EXCEPTION 'Both closeout RPCs must exist with exact signatures';
  END IF;
  IF target_table IS NULL OR audit_table IS NULL THEN
    RAISE EXCEPTION 'Closeout and audit tables must exist';
  END IF;
  IF has_function_privilege('anon', staff_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', staff_fn, 'EXECUTE')
     OR has_function_privilege('anon', admin_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', admin_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Closeout RPCs must not be callable by anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role',staff_fn,'EXECUTE')
     OR NOT has_function_privilege('service_role',admin_fn,'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must be able to call closeout RPCs';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = audit_table) THEN
    RAISE EXCEPTION 'Audit table must have RLS enabled';
  END IF;
  IF has_table_privilege('anon',audit_table,'SELECT')
     OR has_table_privilege('authenticated',audit_table,'SELECT')
     OR has_table_privilege('anon',audit_table,'INSERT')
     OR has_table_privilege('authenticated',audit_table,'INSERT') THEN
    RAISE EXCEPTION 'Audit table grants must be restricted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='event_box_paper_block_closeouts'
      AND indexname='paper_block_inventory_once_idx'
  ) THEN
    RAISE EXCEPTION 'Missing inventory reconciliation unique index';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.oid='public.inventory_movements'::regclass
      AND t.tgname='inventory_movements_sync_media_lot'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Missing media lot inventory sync trigger';
  END IF;
END $$;
-- Negative authorization check: invalid admin cannot produce a closeout.
DO $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_record_staff_paper_block_closeout(
      gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
      10,0,5,gen_random_uuid(),gen_random_uuid(),
      'PR183 unauthorized admin test'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%sin permiso%' THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Unauthorized admin closeout was not rejected';
  END IF;
END $$;
ROLLBACK;
\echo 'PASS: real PostgreSQL catalog, grants, audit RLS, inventory trigger and negative admin authorization.'
\echo 'NOT COVERED: seven-case AM/PM fixture, concurrent sessions, end-to-end idempotency, authenticated browser QA.'

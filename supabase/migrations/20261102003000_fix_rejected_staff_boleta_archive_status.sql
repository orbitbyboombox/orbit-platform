-- Preserve rejected honorarios document history using a status accepted by the table constraint.
-- Only change the status transition in the existing function; preserve all other behavior.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='submit_staff_monthly_boleta'
   AND pg_get_function_identity_arguments(p.oid) LIKE 'p_staff_id uuid, p_month date%';
 IF definition IS NULL THEN RAISE EXCEPTION 'Function not found'; END IF;
 IF position('set status=''REPLACED''' in definition)=0 THEN RAISE EXCEPTION 'Expected function version missing'; END IF;
 definition := replace(definition, 'set status=''REPLACED''', 'set status=''ARCHIVED''');
 EXECUTE definition;
END $$;

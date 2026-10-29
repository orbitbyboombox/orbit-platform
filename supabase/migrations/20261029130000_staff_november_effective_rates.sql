-- Safe, additive migration for November staff tariff.
-- Existing production functions, triggers, publication rules and historical payments
-- are deliberately NOT replaced or recalculated.
-- The November rate function already exists in the production database from
-- migration staff_rates_effective_20261101; validate its presence before release.
DO $migration$
BEGIN
  IF to_regprocedure('public.staff_rate_effective_20261101(text,numeric)') IS NULL THEN
    RAISE EXCEPTION 'Missing prerequisite staff_rates_effective_20261101 migration';
  END IF;
  IF public.staff_rate_effective_20261101('OPERATOR',4.5) IS DISTINCT FROM 32500
     OR public.staff_rate_effective_20261101('SUPERVISOR',4.5) IS DISTINCT FROM 32500
     OR public.staff_rate_effective_20261101('ASSEMBLY',2) IS DISTINCT FROM 10000
     OR public.staff_rate_effective_20261101('DISASSEMBLY',2) IS DISTINCT FROM 10000 THEN
    RAISE EXCEPTION 'November staff rates do not match approved tariff';
  END IF;
END
$migration$;
-- No DDL/DML on assignments, settlements, rates, or payment snapshots.

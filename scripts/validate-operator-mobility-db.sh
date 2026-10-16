#!/usr/bin/env bash
set -euo pipefail
# LOCAL-ONLY reproducible schema preflight; never connect to production.
for command in docker supabase psql; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "BLOCKED: missing $command; no DB writes performed" >&2
    exit 2
  fi
done
if [[ -n "${DATABASE_URL:-}" || -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "BLOCKED: external database URL environment must be unset" >&2
  exit 3
fi
docker info >/dev/null
supabase start
# Resets ONLY Supabase CLI local Docker database and replays repository migrations.
supabase db reset --local --yes
db_url="$(supabase status -o env | sed -n 's/^DB_URL=//p' | tr -d '"')"
if [[ "$db_url" != *"127.0.0.1"* && "$db_url" != *"localhost"* ]]; then
  echo "BLOCKED: DB is not demonstrably local" >&2
  exit 4
fi
psql "$db_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
 if to_regclass('public.event_staff_settlement_adjustments') is null
    or to_regclass('public.event_staff_payments') is null
    or to_regclass('public.projects') is null then
   raise exception 'Incomplete financial schema';
 end if;
 if to_regprocedure('public.save_event_staff_assignment_with_mobility(jsonb,uuid,uuid,uuid,text,numeric)') is null then
   raise exception 'Mobility RPC missing';
 end if;
 if not exists (select 1 from pg_trigger where tgname = 'operator_mobility_settlement_recalculation' and tgrelid = 'public.event_staff_settlement_adjustments'::regclass) then
   raise exception 'Recalculation trigger missing';
 end if;
end $$;
SQL
echo "LOCAL SCHEMA PASS. Still require authenticated APPLY/CLEAR, financial totals, rollback and concurrency integration tests."
echo "After tests: supabase stop --no-backup"

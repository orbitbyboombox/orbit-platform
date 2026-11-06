#!/usr/bin/env bash
set -euo pipefail
# `supabase start` applies migrations during initialization, so the
# runner-only duplicate-version normalization must happen before it.
test -e supabase/migrations/0159_logistics_route_publication.sql
test ! -e supabase/migrations/01590000000001_logistics_route_publication.sql
test -e supabase/migrations/20260921230500_staff_assignment_request_block_scope.sql
test ! -e supabase/migrations/20260922095000_staff_assignment_request_block_scope.sql
test -e supabase/migrations/20261006120000_staff_assignment_payment_overrides.sql
test -e supabase/migrations/20261006120000_staff_accounting_month_from_event_date.sql
mv supabase/migrations/0159_logistics_route_publication.sql \
  supabase/migrations/01590000000001_logistics_route_publication.sql
# This legacy FK migration references event_operational_blocks,
# created by 20260922090000. Place only the runner copy after it.
mv supabase/migrations/20260921230500_staff_assignment_request_block_scope.sql \
  supabase/migrations/20260922095000_staff_assignment_request_block_scope.sql
mv supabase/migrations/20261006120000_staff_accounting_month_from_event_date.sql \
  supabase/migrations/20261006120001_staff_accounting_month_from_event_date.sql
test -e supabase/migrations/20260927170000_staff_reimbursement_zero_defaults.sql
test ! -e supabase/migrations/20260927170001_staff_reimbursement_zero_defaults.sql
mv supabase/migrations/20260927170000_staff_reimbursement_zero_defaults.sql \
  supabase/migrations/20260927170001_staff_reimbursement_zero_defaults.sql
test ! -e supabase/migrations/0159_logistics_route_publication.sql
test -e supabase/migrations/01590000000001_logistics_route_publication.sql
test -e supabase/migrations/20260922095000_staff_assignment_request_block_scope.sql
test -e supabase/migrations/20260927170001_staff_reimbursement_zero_defaults.sql
test -e supabase/migrations/20261006120001_staff_accounting_month_from_event_date.sql
# This historical migration also contains a Production-only
# September backfill. Keep its schema/functions in the isolated
# bootstrap, but omit only the data-dependent block because the
# runner intentionally has no Production records.
python3 - <<'PY'
from pathlib import Path
path = Path('supabase/migrations/20261007200500_fix_staff_settlement_record_access.sql')
source = path.read_text()
malformed = '\n+create or replace function public.calculate_staff_monthly_settlement('
if malformed not in source:
    raise SystemExit('Expected isolated-only malformed migration prefix was not found')
path.write_text(source.replace(malformed, '\ncreate or replace function public.calculate_staff_monthly_settlement(', 1))
print('Removed one malformed patch prefix from isolated migration copy; repository file unchanged.')
path = Path('supabase/migrations/20261009223000_paper_initial_inventory_and_wcm.sql')
source = path.read_text()
start = source.index('do $$\n')
end = source.index('end $$;', start) + len('end $$;')
path.write_text(source[:start] + '-- Isolated runner omits Production-only paper inventory initialization.\n' + source[end:])
print('Omitted isolated-only paper inventory initialization; schema and WCM table retained.')
path = Path('supabase/migrations/20261029130000_staff_november_effective_rates.sql')
if not path.exists():
    raise SystemExit('Expected November rate validation migration was not found')
path.unlink()
print('Omitted Production-only November rate validation guard; no schema or data mutation was removed.')
source = Path('features/portal-authentication/paper-block-storage.sql')
if not source.exists():
    raise SystemExit('Expected staged paper block schema was not found')
Path('supabase/migrations/20261105112900_staff_paper_block_closeouts_schema.sql').write_text(source.read_text())
print('Added runner-only migration from staged paper block schema before the PR RPC.')
path = Path('supabase/migrations/20260916104753_office_lease_september_initial_income.sql')
source = path.read_text()
start_marker = '-- September 2026 was the initial, partial period.'
end_marker = 'create or replace function public.register_office_lease_payment('
start = source.index(start_marker)
end = source.index(end_marker, start)
path.write_text(source[:start] + source[end:])
print('Omitted isolated-only Production data backfill from 20260916104753; schema and functions retained.')
path = Path('supabase/migrations/20260923120000_founder_force_delete_status_safe_qa.sql')
source = path.read_text()
old = ("  if position(invalid_clause in ddl) = 0 then\n"
       "    raise exception 'Canonical purge function did not contain the known invalid reservation status mutation';\n"
       "  end if;\n"
       "  execute replace(ddl, invalid_clause, safe_clause);")
new = ("  if position(invalid_clause in ddl) > 0 then\n"
       "    execute replace(ddl, invalid_clause, safe_clause);\n"
       "  end if;")
if old not in source:
    raise SystemExit('Expected strict purge assertion was not found')
path.write_text(source.replace(old, new, 1))
print('Made isolated purge-status correction idempotent; no purge is executed.')
path = Path('supabase/migrations/20260928110000_staff_reimbursements_from_approved_submissions.sql')
source = path.read_text()
start_marker = '-- Regression guard: an approved submission remains visible'
start = source.find(start_marker)
if start < 0:
    raise SystemExit('Expected reimbursement regression guard was not found')
end = source.find('\ncommit;', start)
if end < 0:
    raise SystemExit('Expected end of reimbursement regression guard was not found')
replacement = ('-- Isolated runner omits the Production-only reimbursement assertion; '
               'view, refresh, and schema logic remain unchanged.\n')
path.write_text(source[:start] + replacement + source[end + 1:])
print('Omitted isolated-only Production reimbursement assertion; migration logic retained.')
PY
echo 'Applied isolated migration-version normalization before Supabase start: 0159_logistics_route_publication.sql -> 01590000000001_logistics_route_publication.sql'
# Keep storage-api enabled: the repository migrations seed storage.buckets.
# Excluding it leaves the storage schema absent and fails the real bootstrap.
# A failed run can leave only the isolated database container behind;
# remove that runner-local residue before binding the fixed local port.
docker rm -f supabase_db_orbit_pr183_isolated >/dev/null 2>&1 || true
supabase start --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor

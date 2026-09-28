# Orbit Boombox — Boleta review financial guard

Date: 2026-09-28

ROOT_CAUSE=public.review_staff_monthly_boleta still called staff_monthly_blocking_events and reintroduced an operational blocker after financial month close.
OLD_OPERATIONAL_GUARD_FOUND=YES
BOLETA_REVIEW_GUARD_FIXED=YES

The RPC now validates only the financial prerequisites: account existence, RECEIVED boleta, FINALIZED settlement, review_required=false, and a CLOSED/PAID monthly close. It does not inspect operational blocking events.

Expected approval outcomes from the existing payment model:

- Heleny Jara: RECEIVED -> APPROVED -> READY_TO_PAY.
- Sebastián Jorquera: RECEIVED -> APPROVED -> READY_TO_PAY; final transfer remains the canonical balance.
- José: RECEIVED -> APPROVED -> PAID when final_transfer_amount=0; no payment action is created.

No live approval mutation was executed from this worktree, so those three production transitions remain pending authenticated UI/database verification.

DATABASE_CHANGED=YES (function definition only)
MIGRATIONS_APPLIED=YES
CODE_CHANGED=YES
TARGETED_REGRESSION_TEST=PASS
TYPECHECK=PASS
BUILD=PASS
LINT=PASS
FULL_SUITE=FAIL (pre-existing unrelated assertion in tests/staff-monthly-settlement-system.test.mts)
PREVIEW_CREATED=NO (no manual Preview was created)
PRODUCTION_DEPLOYMENT=BLOCKED (Vercel deploy connector unavailable: deploy_to_vercel tool not found)
ACTIVE_SHA=2327b5511a9a406bab26278b926906a3ed4cd88e
FINAL_VERDICT=READY_FOR_PRODUCTION_DEPLOYMENT_BUT_VERCEL_DEPLOY_BLOCKED

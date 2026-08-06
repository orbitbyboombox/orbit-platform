# Supabase Production Deployment Report

Deployment date: 2026-08-06
Project reference: `uiwlcmbrowtmqwhnsnxz`

## Migration

- Source: `database/migrations/0001_production_backbone.sql`
- Supabase CLI: `2.111.0`
- Dry run: successful
- Remote execution: successful
- Migration history: local `0001` = remote `0001`
- Remote schema lint: no schema errors found

The CLI emitted a post-deployment warning because Docker Desktop was unavailable for the optional local `pg-delta` cache. The remote migration completed with exit code 0 and subsequent remote inspection confirmed the deployed schema.

## Tables verified

`profiles`, `customers`, `projects`, `project_services`, `timeline_events`, `staff`, `assignments`, `customer_memory`, `supplies`, `expenses`, `profit_snapshots`, `calendar_sync`, `drive_sync`, `communications`, `conversation_states`, `agreements`, `agreement_evidence`, `documents`, `connector_jobs`, `dead_letter_jobs`, `connector_logs`, and `audit_events`.

The requested conceptual names map to the migration's official physical names:

- NOVA conversations → `conversation_states`
- Audit logs → `audit_events`

No placeholder records were inserted. All inspected production tables contained zero rows at deployment time.

## RLS

The migration enabled RLS on every production table and created the approved initial policies. The migration was applied transactionally and the remote Supabase schema linter reported no errors. Policies were not modified during deployment.

## Storage

Verified through the Supabase Storage API using the project Secret Key:

- `orbit-documents` — private
- `orbit-signatures` — private
- `orbit-expenses` — private

## Authentication

Supabase Auth admin endpoint returned HTTP 200 and one existing Auth user. Authentication is operational.

## Application configuration

The previous server credential did not belong to the configured project. `.env.local` now contains the official `sb_secret_...` credential for the linked project under `SUPABASE_SECRET_KEY`; the legacy compatibility variable was corrected as well. The value was never printed or committed.

`lib/supabase/admin.ts` provides the server-only administrative client. Browser and authenticated request clients continue to use the publishable key and RLS.

## Validation

- TypeScript: passed
- ESLint: passed
- Next.js production build: passed
- `git diff --check`: passed
- Supabase remote table inspection: passed
- Supabase remote schema lint: passed
- Storage API: passed
- Auth Admin API: passed

## Remaining scope

The production database is deployed and ready for repository cutover. Existing demonstration screens that explicitly import mock fixtures were not changed during this database-only deployment. Their replacement belongs to the persistence implementation gate and must use authenticated RLS clients, not the administrative client.

## Decision

**GO for PF-02 / persistence cutover.**
**NO GO for operating BOOMBOX entirely from ORBIT until mock composition roots are replaced and role-by-role RLS tests pass.**

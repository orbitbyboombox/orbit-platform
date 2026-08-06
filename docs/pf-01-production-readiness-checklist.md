# PF-01 Production Readiness Checklist

## Implemented in source

- Migration-ready PostgreSQL schema, indexes, RLS, private storage buckets, and Realtime publication.
- Durable audit metadata, immutable audit events, state evidence, versioning, and soft deletion.
- Persistence contracts with optimistic concurrency.
- Idempotent connector jobs, bounded retries, dead-letter preparation, and structured logging.
- Real Google Calendar, Drive, Gmail, and Workspace OAuth adapters behind existing interfaces.
- Exact environment contract documented in `.env.example`.

## Required before production cutover

- Apply and roll back the migration in Supabase staging.
- Generate database types from the deployed schema and bind repositories to them.
- Approve granular Sales/Operations mutation policies; the initial policy intentionally grants writes only to CEO/Admin.
- Implement encrypted, server-only OAuth session/token custody and callback endpoints.
- Select production adapters at the server composition root; current screens may still explicitly import demonstration fixtures.
- Backfill and reconcile all existing customer/project data.
- Validate signed URL expiry, file type scanning, retention, and deletion policy.
- Execute role-by-role RLS penetration tests and audit-log immutability tests.
- Exercise connector duplicate delivery, token expiry, rate limiting, retry, and dead-letter recovery.
- Add operational alerts and an external log sink before live traffic.

## Production risks

1. Migration has not been executed against the target Supabase project in this environment.
2. Current UI demonstration state is not automatically migrated; cutover requires a controlled composition and data migration step.
3. OAuth tokens need a managed encrypted secret store before live Google connections.
4. RLS write permissions for Sales and Operations require an approved least-privilege responsibility matrix.
5. Generated Supabase database types are unavailable until the remote schema exists.

# ORBIT administrative backup runbook

## Key custody

`ORBIT_BACKUP_ENCRYPTION_KEY` (32-byte hex/base64) or `BACKUP_ENCRYPTION_PASSPHRASE` is required only in the protected server environment. Store the value in the organization's approved secret manager with at least two authorized custodians and a documented recovery procedure. Never store it in Drive, Git, the database, logs, browser storage, or the backup manifest. Losing the key makes encrypted Storage backups unrecoverable.

## Storage execution

Apply `20261015120000_admin_backup_runs.sql` through the authorized Supabase migration process, then use the Founder/Admin backup action with a unique idempotency key. Each request processes a bounded batch and returns `CHECKPOINTED`; repeat the same key until `SUCCEEDED`. A stale lease cannot be resumed concurrently because it requires a conditional lease-token claim.

## Isolated recovery test

Use a non-production temporary Drive folder and a server process with the same protected key. Download `manifest.json.enc`, decrypt it, verify its SHA-256, then for each encrypted object decrypt, verify the plaintext SHA-256, and restore only into a temporary Storage bucket while preserving the manifest's exact `bucket` and `path`. Compare object count, paths, sizes, MIME metadata, and hashes before deleting the temporary objects.

## Database

Database backup is intentionally separate. It requires a protected, consistent `pg_dump` path and a recoverable `SUPABASE_DB_URL`; Storage manifests and SQL metadata are not database backups.

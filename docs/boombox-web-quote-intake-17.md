# BOOMBOX web quote intake — Issue #17

Status: implementation and isolated QA; NOT production-certified or published.
Related issue: https://github.com/orbitbyboombox/boombox-web/issues/17

## Contract and ownership

Wix sends JSON to `POST /api/integrations/boombox/quotes` using a server-only bearer token. `solicitudId` is mandatory and immutable. The PostgreSQL RPC atomically inserts one `web_quote_leads` row or returns that same row. A changed payload under the same ID returns 409. Concurrent notification claims use a conditional UPDATE; only one caller can claim PENDING.

The new table is an intake inbox owned by Leads, not a duplicate reservation pipeline. No Customer, Event, quotation document, calendar, payment or financial movement is created. A future reservation must still use the existing canonical pipeline. Raw captured data is immutable; internal review notes/corrections and NEW/REVIEWED/ARCHIVED status are separate. Authenticated CEO/ADMINISTRATOR can read/review in `/leads`; anonymous users cannot read/write. QA rows are hidden from the commercial inbox and never enter existing operational KPI queries.

## Email truth

Production recipient is fixed to `contacto@bbox.cl`; non-production recipient is fixed to `matias.maira.larrain@gmail.com`. The form cannot override recipients, environment, sender, URL or CC/BCC. Notification is internal only. The existing Google Workspace token loader is reused; no customer email is generated.

ACCEPTED means Gmail returned a provider message ID, **not confirmed inbox delivery**. FAILED means an explicit pre-send/auth or provider rejection. UNKNOWN and stale SENDING require human reconciliation against the provider message/sent folder and target mailbox before any resend. Provider send is attempted once: no retry loop after timeout, 429 or 5xx. A failure recording provider acceptance leaves the claim SENDING, preserving both the lead and duplicate protection. A process crash after claim can therefore leave a notification requiring manual recovery; never reset it blindly.

Success to the visitor means the quote was persisted. Email failure does not erase the lead or turn an accepted quote into an unsaved request. Notification state is available in the admin inbox. Stored GCLID/UTM enable commercial traceability; their presence alone does not prove Google Ads attribution.

## Deployment gates (not executed)

1. Use a separate isolated database for hosted preview; apply `0258_boombox_web_quote_intake.sql` there, not production.
2. Set an independently generated random `BOOMBOX_WEB_QUOTE_TOKEN` (at least 32 characters) on the matching Wix backend and ORBIT environment. Do not reuse preview and production tokens. Wix also requires `BOOMBOX_WEB_QUOTE_INTAKE_URL` pointing explicitly to the intended ORBIT endpoint; no implicit fallback to production.
3. ORBIT requires `BOOMBOX_WEB_QUOTE_ENABLED=true`. Default is closed. Email requires the separate `BOOMBOX_WEB_QUOTE_EMAIL_ENABLED=true`; default sends nothing. Non-production is determined server-side by `VERCEL_ENV !== production`; do not override with browser input. Verify Google Workspace Gmail send permission in the target environment.
4. In hosted Wix preview, verify its HTTP request targets the preview backend, not a cached live embed. The companion builder requires explicit `BOOMBOX_QUOTE_ENDPOINT`; the fragment has no production fallback. Never send preview tests through the live form endpoint. Local isolated tests replace transport in memory and do not need these secrets.
5. Verify one persisted TEST record, fixed test recipient, actual receipt, provider ID, errors/duplicates and browser Tag Assistant. QA responses deliberately have `conversionEligible:false`; validate the eligible conversion branch with a mocked tag sink rather than adding fake Ads conversions.
6. Full-repository lint/typecheck/build, real iPhone QA, and Founder operational validation remain required. Automated tests do not certify modules under Constitution Article 12.
7. Only with explicit approval and complete QA: apply the additive migration to production, deploy ORBIT with sending disabled, configure the matching Wix secrets, replace the canonical master embed and **replace** the old V2 tag bridge (never append both), then enable intake/notification and verify production with authorized isolation. No Ads settings or campaign changes belong to this release.

Rollback: close `BOOMBOX_WEB_QUOTE_ENABLED` and disable notification; retain all intake records for recovery. Do not drop the table or revert to an email-only success path. Revert code through normal reviewed release controls if required. An archived intake remains recoverable.

## Isolated tests

`pnpm test:web-quotes`: real migration executed in in-memory PostgreSQL (PGlite), no production database or network. Covers required fields/auth, concurrent retries, immutable-ID conflict, preserved attribution, email failures, acceptance-write crash, RLS/grants and persistence outages. Gmail is mocked, so no receipt claim can be made.

The companion web checkout runs `npm run test:quote-intake` and `node tests/cross-repo-quote-qa.mjs ../orbit-platform`. These execute the actual form script and Wix forwarding service against the ORBIT handler and isolated database. DOM 390/1280 px tests are not real-device certification.

Constitution review: Articles 1–15 preserved: no parallel reservation pipeline or CRM/customer creation, no operational/financial mutations, no automatic customer communication, no workspace resets, no protected-data cleanup, no production KPI contribution from QA, and no certification claim.

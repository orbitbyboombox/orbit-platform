# ORBIT v2.1.6 P0 performance audit — 11/11/2026

Status: NO READY for production publication. Candidate changes are isolated on `fix/p0-request-auth-and-staff-history-index`; protected production base is `af8ef645a4ac435ffd1b246980e817cf55a125cf`.

## Observed production baseline

Read-only Vercel telemetry, 11/11/2026 00:00–09:20 UTC (10/11 21:00–11/11 06:20 Chile). These are server invocation p75 values, mixing existing render/action/prefetch traffic. They are not browser paint times, navigation-to-ready times, or iPhone-specific measurements.

| Route | Server execution p75 | Function TTFB p75 |
|---|---:|---:|
| /operations | 3,618 ms | 1,828 ms |
| /resources/staff | 2,419 ms | 472 ms |
| /events | 562 ms | 139 ms |
| /finance | 137 ms | 75 ms |
| /finance/collections | 47 ms | 47 ms |
| /resources/boxes | 21 ms | unavailable in top-15 TTFB |
| /staff-portal | 2,361 ms | unavailable in top-15 TTFB |

After timings: not available; candidate has not been released to production. Do not present any of these figures as a measured improvement.

## Demonstrated causes and candidate fixes

- Platform layout and page create different Supabase clients and each calls `getUser`. Share a client and its verified user lookup with React request-scoped `cache`. Server Action clients remain fresh. Functional tests use the actual React server cache and concurrent request contexts to verify isolation, one validation per render, error propagation and fresh action clients. Middleware session refresh and layout role authorization are unchanged.
- Metadata and root SettingsGate both load company settings. Add request-scoped memoization around the existing five-minute tagged configuration cache; preserve invalidation and configured branding.
- NavigationList automatically prefetches all visible links. Disable automatic menu prefetch, keeping the same links, layout and click navigation. This avoids a burst of protected RSC requests on initial desktop/mobile rendering.
- Staff history query filters `staff_id IS NOT NULL`, sorts globally by `occurred_at DESC`, and takes 500 records. Existing leading-staff-ID index cannot provide global chronology. Actual production EXPLAIN: 174.659 ms, 1,121 shared buffers, 1,064 rejected rows. Candidate partial index: `(occurred_at DESC,id DESC) WHERE staff_id IS NOT NULL`. Isolated PostgreSQL test preserves exact results and uses the new index without post-filtering. Migration is not applied in production.
- Audit history already has appropriate indexes. Staff documents contain only 125 live rows and their sequential scan is reasonable; no speculative extra index was added.
- Operations starts dozens of reads and waits for secondary finance/communication/health projections before returning the full dashboard. It also invokes alert reconciliation on navigation; Collections refreshes receivable notices during reads. Those workflows were not executed by this audit or changed under a performance-only patch.

## Runtime errors

- Current production: Staff approval `Contrato operacional no preparado` and package delivery `PGRST116` (multiple matching rows), last observed 11/11/2026 around 09:15 UTC. These are active workflow failures, not evidence of a slow login. No approval, contract repair or email delivery was executed.
- `accounts_receivable_projection.payment_history` missing column: observed on previous deployment `dpl_CiCUiddHiMjx6mcm9hHTSsDcFYiG`, last seen 10/11/2026 15:16 UTC; not observed in the latest one-hour error report.
- `/staff/login` stale Server Action ID: previous deployment `dpl_CVweRunhQdVcvkfThai8Vz9jgVtJ`, last seen 10/11/2026 21:43 UTC; not observed in the latest one-hour error report.

## Validation and remaining gates

- Production build, TypeScript and targeted lint PASS.
- 106 financial/settlement/period-PDF/email protocol tests PASS, no real messages or payments.
- 32 auth/session/role/layout/navigation regression tests PASS. Two obsolete source-pattern expectations also failed on the untouched production checkout; updated them to assert the current middleware/profile guard location rather than remove session validation or require a comment.
- New request authentication functional test PASS, including concurrent user isolation.
- New isolated PostgreSQL history-index correctness/plan test PASS.
- Inventory, canonical box/staff cost, contract PDF and environment safety tests PASS.
- Collections email suite: 8 PASS, 2 FAIL; both reproduced on the untouched production checkout. Expectations reference an older plain-text template and an over-escaped source regex. No collection-template or financial behavior changes were made to hide these failures.
- Browser Staff login form loads and renders. No login form was submitted. Browser evaluator does not expose Performance API timing; connected viewport cannot certify iPhone hardware timing. Vercel Speed Insights LCP query returns HTTP 402, so no mobile browser paint telemetry is available through this connection. No billing/settings upgrade was attempted.
- Authenticated after-change navigation, complete first paint/black-screen measurements, and iPhone comparison are pending. Do not label all QA PASS or merge/promote while those gates remain unverified.

No operational rows, schedules, emails, payments, inventory, event records or financial values were changed. No automations were executed. A preview-only branch override enables the repository's existing read-only safeguards for safe review; production configuration remains unchanged.

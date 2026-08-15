# ORBIT Commercial Hub 1.1 — Certified Baseline

## Certification

- Status: **CERTIFIED**
- Founder approval: **APPROVED**
- Certification date: **2026-08-15 (America/Santiago)**
- Certified implementation commit: `818dc020142647e59c9a7fdeb9c272dc790ce54f`
- Certified deployment: `dpl_4bTPo9EhjNxa8TGCCYmo5ruy2LXa`
- Production domain: `https://orbit.boom-box.cl`
- Automated tests: **113 passed / 0 failed**
- Typecheck: **PASS**
- Build: **PASS**
- Lint: **PASS with 3 pre-existing out-of-scope warnings / 0 errors**
- Repository synchronization: `main == origin/main`

## Certified Scope

- New Customer and the shared Reservation Pipeline.
- Commercial Hub quick-send for Matrimonios, Cumpleaños, Graduaciones and Empresas.
- Canonical, versioned Commercial Documents and the three public catalog viewers.
- Founder-owned email templates and graphical signature.
- Formal corporate quotation builder, immutable price snapshots and canonical numbering.
- Formal quotation PDF, storage, download, explicit email delivery and send history.
- Quote-to-reservation conversion through the shared Reservation Pipeline.
- Contract, signature, independent payment movements and reservation confirmation rules.
- Chilean phone normalization, Global Search, IVA alerts and Founder Escritorio integration.
- Mobile-first operation at 320, 390 and 430 px; tablet at 768 px; desktop at 1366 and 1440 px.

## Founder-approved PDF Baseline

The certified PDF is the final two-page Founder-approved composition:

- Page 1 contains the corporate header, customer, single services grid, totals and the compact reservation summary.
- Page 2 uses one single vertical column for Important, Reservation Conditions, Payment Information, Operational Conditions and the commercial closing.
- No double grid or two-column conditions layout is permitted in this frozen baseline.

Reference artifact:

`output/pdf/ORBIT_Cotizacion_Premium_2_Paginas_Founder_Review.pdf`

## Canonical Data Verification

- Supabase Production ref: `uiwlcmbrowtmqwhnsnxz`.
- Active catalogs: WEDDINGS, COMPANIES and EVENTS; version `2026-2027`.
- One active catalog per category is enforced by a partial unique index.
- Formal quote numbers contained no duplicates at certification time.
- All recorded commercial sends contained idempotency keys.
- Active TEST customer data: **0**.
- Protected production Customers remained present and unchanged: Daniela Frías, Victoria, Soledad Provens, Abigail and Dominga.

## Relevant Migrations

- `0119_commercial_hub_11.sql`
- `0120_commercial_hub_storage_policies.sql`
- `0121_commercial_hub_founder_review_fix_02.sql`
- `0122_commercial_hub_founder_review_fix_04.sql`
- `0123_commercial_hub_founder_review_fix_05.sql`
- `0124_commercial_quote_operational_conditions.sql`
- `0125_global_search.sql`

## Production Verification

- Production returned HTTP 200 and served implementation commit `818dc020`.
- System Health reported ORBIT operational, Supabase Database/Auth/Storage operational and Google OAuth/Gmail/Calendar/Drive authorized.
- No error or fatal runtime logs were present for the certified deployment during the certification window.
- Global Search returned canonical Customer, Event and Quotation results for `Soledad`.
- Public catalog routes `/catalogo/novios`, `/catalogo/empresas` and `/catalogo/eventos` exposed Download, Share and commercial CTA actions without administrative UI.

## Freeze Rule

Commercial Hub 1.1 is frozen after Founder certification. Future modifications are limited to critical production bugs and must preserve the ORBIT Constitution, canonical ownership, the shared Reservation Pipeline, immutable historical snapshots and explicit customer communication.

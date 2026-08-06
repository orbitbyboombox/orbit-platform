# ORBIT v1.0 — Founders Staging Deployment Report

## Deployment

- Environment: Vercel Preview / Founders Staging
- Project: `orbit-by-boombox/orbit-platform-v1`
- Deployment ID: `dpl_DL6zBftPLwnEmzzxk2i6o58LtNSf`
- Public URL: `https://orbit-platform-v1-37lo3mfq0-orbit-by-boombox.vercel.app`
- Target: `preview`
- State: `READY`
- Production promotion: not performed
- Production DNS: unchanged

## Build

- Next.js 15.5.22 production build: passed
- TypeScript validation: passed
- ESLint validation: passed
- Static generation: passed
- Serverless functions: generated successfully
- Build region: Washington, D.C. (`iad1`)

## Environment

The existing Preview environment was reused. No Supabase value was replaced or regenerated.

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

All five variables are encrypted and enabled for Development, Preview and Production.

## Online validation

- Public access: passed; `/login` returns HTTP 200 without Vercel authentication.
- Login: passed.
- Session after refresh: passed.
- Session in a new browser tab: passed.
- Dashboard: passed.
- CRM: passed; production repository returned zero active relationships.
- Timeline: route and empty projection passed.
- Staff: passed; production repository returned zero registered staff.
- Finance: passed; production validation records loaded.
- Operations: passed as a clearly labeled validation/demo experience.
- Customer Workspace and Portal presentation: passed as a clearly labeled simulated experience.
- Navigation: passed.
- Dark mode: passed (`html.dark`, body background `rgb(12, 12, 13)`).
- Official horizontal logo: passed.
- Compiled isotype asset: HTTP 200.
- Browser console: no errors across validated routes.
- Vercel runtime logs: no error-level entries during validation.
- Desktop, tablet and mobile: passed.

## Known limitations

1. Customer Workspace and Customer Portal still declare simulated data. They are suitable for Founders UX review but are not evidence of complete production persistence.
2. Public files such as `/favicon-32x32.png` and `/apple-touch-icon.png` are redirected to `/login` by middleware for unauthenticated visitors. The compiled application logos load correctly, but the unauthenticated favicon path requires a later middleware exception.
3. Dashboard and Operations contain validated demonstration information and are explicitly marked with the validation banner.

No code was changed to hide these limitations because this deployment was required to use the certified build without authentication, architecture, business-rule or UI changes.

## Recommendation

**GO for Founders Beta staging review.**

**NO GO for operational production cutover** until Portal/Workspace data is fully persistent and public favicon routes are excluded from authentication middleware.

# Repository Manifest

- Repository: `https://github.com/orbitbyboombox/orbit-platform.git`
- Main branch: `main`
- Certified tag: `orbit-v1.0-certified`
- Package: `orbit-platform-foundation` `0.1.0`
- Runtime: Node.js `>=22.13.0`
- Package manager: pnpm (lockfile committed)
- Framework: Next.js 15 App Router, React 19, TypeScript 5.9, Tailwind CSS 4

## Main directories

`app/` routes and APIs; `features/` domain modules; `components/` shared UI; `lib/` infrastructure; `supabase/migrations/` canonical schema history; `public/` public assets; `scripts/` operational tooling; `docs/` Constitution and existing documentation; `ORBIT CODEX/` continuity documentation.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run start
```

Production deploys from GitHub through Vercel. A documentation-only commit must use the approved CI skip mechanism and be verified not to replace the certified Production deployment.

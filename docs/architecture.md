# ORBIT Platform foundation and design system

ORBIT uses a feature-first architecture. Product-specific code belongs under `features/`; shared presentation primitives live in `components/`; integrations are isolated behind `services/` and `lib/`.

DEV-003 keeps the same feature-first boundaries and adds the guarded application shell. There are no database tables, seed data, CRUD flows, or business workflows. Module routes contain presentation-only placeholders.

## Dependency direction

- `app` composes routes and layouts.
- `features` owns domain-facing UI, schemas, and use cases.
- `components` contains reusable, domain-agnostic UI.
- `services` wraps external operations.
- `lib` contains framework and vendor adapters.
- `database` is reserved for future schema and migrations.

## Design system

- `components/ui` contains low-level controls and status presentation.
- `components/layout` owns responsive application composition.
- `components/cards`, `forms`, `timeline`, and `copilot` contain reusable composition patterns.
- Shared navigation metadata has one source of truth in `components/layout/navigation.ts`.
- Semantic color tokens in `app/globals.css` support light and dark themes.

## Authentication

Supabase authentication remains server-side. Secrets remain server-only through `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Middleware refreshes sessions, the platform route group verifies the current user, and unauthenticated requests return to `/login`.

## Routing

The `app/(platform)` route group applies one authenticated layout to Dashboard, Projects, Leads, Operations, Resources, Finance, Reports, and Settings. Route pages contain only module metadata passed into the shared `ModulePage` composition.

## Projects DEV-004

Projects is the first interactive feature. Its typed UI state, mock records, drawer flow, filters, and cards live entirely under `features/projects`. State is memory-only and resets on reload. The dynamic `/projects/[projectId]` route is a presentation-only workspace handoff for DEV-005; it has no database or persistence dependency.

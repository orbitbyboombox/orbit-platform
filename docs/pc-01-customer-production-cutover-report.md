# PC-01 — Customer Production Cutover Report

Date: 2026-08-06
Supabase project: `uiwlcmbrowtmqwhnsnxz`

## Cutover

The CRM Premium route no longer imports `initialProjects` or the card-level `relationshipContext` fixture. The existing UX now receives a server-rendered projection built from production `customers`, `projects`, `project_services`, `timeline_events`, and `customer_memory` records through the authenticated Supabase SSR client and RLS.

The fixture files remain in the repository but are not consumed by the Customer list or Customer card.

## Repositories

- `CustomerRepository` defines customer/project aggregate loading, creation, update, soft delete, and restore.
- `SupabaseCustomerRepository` implements the contract with optimistic version predicates.
- Creation persists Customer, Project, initial Timeline event, and Customer Memory.
- Search operates over the production projection and supports customer, phone, project/company, city, and localized event type.
- Customer card communication, owner, next action, and tags now come from Timeline and Customer Memory rather than hardcoded records.

## RLS provisioning

The authenticated `admin@orbit.boom-box.cl` identity was associated with the `CEO` profile. An earlier profile assignment to a different Auth identity was detected because `current_orbit_role()` returned null for the active session; the active identity was then provisioned explicitly by email. No authentication flow was changed.

## Persistence validation

A controlled record named `Validación PC-01` was used and left soft-deleted after testing.

| Validation | Result |
| --- | --- |
| Create Customer + Project | Passed |
| Project association | Passed |
| Timeline association | Passed |
| Customer Memory association | Passed |
| Reload persistence | Passed |
| Search by customer | Passed |
| Search by phone | Passed |
| Search by project/company | Passed |
| Search by city | Passed |
| Search by event type | Passed |
| Update | Passed, version 1 → 2 |
| Stale update | Rejected, zero rows affected |
| Soft delete | Passed, version 2 → 3 |
| Restore | Passed, version 3 → 4 |
| Final soft delete | Passed, version 4 → 5 |
| Authenticated updated_by | Passed |
| Audit events | Passed |

The final CRM projection contains zero active QA records. The historical audit and timeline evidence remains intentionally durable.

## Validation

- TypeScript: passed
- ESLint: passed
- `git diff --check`: passed
- Desktop: passed
- Tablet: passed
- Mobile: passed

## Remaining risks

- The Project Workspace detail route still has legacy mock/query fallback behavior outside the Customer list cutover scope.
- Other modules continue to consume their own fixtures until their respective cutover sprints.
- Customer update/delete/restore server actions are implemented, but the frozen CRM UX currently exposes no controls for these operations; validation was performed through authenticated RLS requests.
- The native date field could not be populated by browser automation. It was not modified because UX is frozen; repository and persistence validation used an equivalent controlled production record.

## Decision

**GO for PC-02 Staff Cutover**, limited to the Staff module. Customer list, search, timeline projection, memory projection, association, versioning, audit metadata, and soft deletion are operating on Supabase production.

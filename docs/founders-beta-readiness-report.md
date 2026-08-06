# ORBIT — Founders Beta Readiness Report

## Executive decision

**NO GO for operating BOOMBOX completely from ORBIT.**

Authentication, CRM list, Timeline, Staff, Profit and Supply use production infrastructure. However, Dashboard, Project Workspace, Customer Portal, Operations Board, Command Center, Expense Capture and Connection Center still consume static or in-memory fixtures. Removing their validation labels would make simulated records look authoritative, so those warnings were deliberately preserved.

ORBIT can be used in a **restricted Founders Beta** only for the modules explicitly certified as production, with operational decisions verified outside the platform.

## Production scope verified

| Area | Status | Evidence |
| --- | --- | --- |
| Authentication | Production | Supabase session and protected-route certification completed |
| CRM customer list/search | Production | `SupabaseCustomerRepository` |
| Timeline | Production | Supabase append-only events and audit |
| Staff | Production | `SupabaseStaffRepository` |
| Profit | Production | `SupabaseProfitRepository` |
| Supply | Production | `SupabaseSupplyRepository` and migration 0005 |
| Dark mode / branding / navigation | Ready | Consistent application shell and frozen branding |
| Google Workspace | Pending | OAuth credentials and live connection absent |

## Critical production risks

1. **Dashboard displays hardcoded operational events and KPIs.** It must not be used as the morning source of truth.
2. **Project detail loads `findMockProject()`**, so Workspace financial, contract and preparation information is not production data.
3. **Customer Portal uses mock agreement, reservation and payment objects.** Customer actions are not durable.
4. **Command Center and Daily Planner consume static operational plans and resource indicators.** Assignments shown there are not authoritative.
5. **Operations Board consumes `MOCK_OPERATIONS_BOARD_SNAPSHOT`.** Availability and capacity may be incorrect.
6. **Expense Capture uses a mock OCR provider** and does not persist the apparent result.
7. **Connection Center can visually “connect” Google Workspace using mock local state.** OAuth is not configured.
8. **Calendar, Drive and Gmail previews render sample records.** No live Google projection exists.
9. **Reservation/payment action controls remain UI-only.** They must not be treated as confirmations.
10. **The global validation banner is currently necessary.** Removing it before the remaining cutovers would create a material operational risk.

## Remaining bugs

- Dashboard routes sample event IDs into Project Workspace records that do not come from Supabase.
- Project Workspace mixes a production route with simulated financial and contract cards.
- Google connection controls report prepared states without an external connection.
- Customer Portal signature, payment and reservation confirmations are not persisted.
- Expense capture presents a successful completion state without durable storage.
- Operations and resource screens can show staff/assets that differ from production repositories.

## Remaining UX improvements

- Replace sample Dashboard content with honest empty/loading states after its production cutover.
- Drive every Project Workspace card from one production project projection.
- Disable unavailable Google actions and label them “Pendiente de conexión” until OAuth exists.
- Replace UI-only success messages with non-committal review states until persistence is connected.
- Add one clear primary action to empty Operations, Portal and Workspace states.
- Remove the validation banner only after every visible operational module is backed by production data.

## Empty-state standard

Every production empty state should contain:

1. What the user is viewing.
2. Why no records are shown.
3. What will appear after the next valid action.
4. One primary action only.

Example: “Aún no hay eventos confirmados. Cuando una reserva sea aprobada, el evento aparecerá aquí. Abrir clientes.”

## Founders Beta — first-week checklist

### Commercial

- [ ] Create a real customer and confirm it remains after reload.
- [ ] Update phone, email, city and event type.
- [ ] Search by customer, phone, project, city and event type.
- [ ] Soft-delete and restore one controlled test customer.
- [ ] Verify every mutation in Timeline and Audit.
- [ ] Do not rely on Project Workspace quotation/contract cards until their cutover.

### Operations

- [ ] Compare each confirmed event against the external operating calendar.
- [ ] Verify ORBIT Event ID consistency.
- [ ] Treat Dashboard, Command Center, Planner and Operations Board as non-authoritative.
- [ ] Record discrepancies and required production projections.
- [ ] Do not approve assignments from simulated operational cards.

### Staff

- [ ] Create and update one staff profile.
- [ ] Validate availability and search.
- [ ] Assign, accept and reject a controlled assignment.
- [ ] Confirm staff Timeline and Audit events.
- [ ] Soft-delete, restore and reload the profile.

### Finance

- [ ] Verify revenue and cost inputs against source documents.
- [ ] Confirm estimated values are not interpreted as accounting records.
- [ ] Validate Profit reload, audit and versioning.
- [ ] Register controlled Supply purchase, consumption and adjustment movements.
- [ ] Confirm stock and event traceability.
- [ ] Do not use OCR completion as a persisted expense until Expense Capture cutover.

### Customer

- [ ] Validate CRM identity and project association.
- [ ] Verify customer Timeline ordering and human-readable messages.
- [ ] Do not send the current Portal as a legally binding signature/payment channel.
- [ ] Keep contract, payment and reservation evidence in the existing external process.

### Google — pending

- [ ] Configure OAuth client ID, client secret and redirect URI.
- [ ] Enable Calendar, Drive and Gmail APIs.
- [ ] Complete offline consent and refresh-token storage.
- [ ] Validate idempotent Calendar create/update/cancel/restore.
- [ ] Validate automatic Drive folder routing.
- [ ] Validate Gmail threading and delivery events.
- [ ] Confirm Timeline and Audit for every Google action.

## Technical validation

- TypeScript: PASS.
- ESLint: PASS.
- Next.js production build: PASS.
- `git diff --check`: PASS.

## Recommendation

**NO GO for unrestricted Founders Beta.**

Conditional GO is limited to Authentication, CRM list/search, Timeline, Staff, Profit and Supply. Complete the remaining data-source cutovers and Google OAuth before BOOMBOX operates entirely from ORBIT.

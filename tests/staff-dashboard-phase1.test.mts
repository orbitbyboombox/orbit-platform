import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  "features/portal-authentication/staff-portal-dashboard.tsx",
  "utf8",
);
const portal = readFileSync("features/portal-authentication/staff-portal.tsx", "utf8");
const operations = readFileSync(
  "features/resources/staff-operations-view.tsx",
  "utf8",
);

test("Staff Phase 1 keeps the dashboard greeting dynamic and weekly", () => {
  assert.match(dashboard, /export const staffGreeting/);
  assert.match(dashboard, /Buenos días/);
  assert.match(dashboard, /Buenas tardes/);
  assert.match(dashboard, /Buenas noches/);
  assert.match(dashboard, /Asignación semanal/);
  assert.match(dashboard, /Eventos publicados/);
  assert.match(dashboard, /currentWeekRange/);
});

test("Staff Phase 1 keeps the published event visibility boundary", () => {
  assert.match(portal, /from\("staff_available_event_projection"\)/);
  assert.match(portal, /portalStaffVisibility\(\{published:true/);
  assert.match(operations, /setStaffEventPublicationAction/);
  assert.match(operations, /Activar para Staff/);
  assert.match(operations, /Desactivar publicación/);
});

test("Staff Phase 1 exposes the expense CTA and responsibility action", () => {
  assert.match(dashboard, /Sube tu gasto/);
  assert.match(dashboard, /TOMAR · Ver pago/);
  assert.match(dashboard, /TOMAR RESPONSABILIDAD/);
  assert.match(dashboard, /requestStaffResponsibilitiesAction/);
});

test("Staff Phase 1 keeps the responsive layout contained", () => {
  assert.match(dashboard, /w-full/);
  assert.match(dashboard, /sm:grid-cols-2/);
  assert.match(dashboard, /variant="fullscreen-mobile"/);
});

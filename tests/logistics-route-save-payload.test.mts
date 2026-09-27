import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const action = await readFile(new URL("../features/resources/logistics-route-publication.actions.ts", import.meta.url), "utf8");

test("route save maps visual labels to canonical database route types", () => {
  assert.match(action, /value === "MONTAGE" \|\| value === "MONTAJE"\) return "ASSEMBLY"/);
  assert.match(action, /value === "DESMONTAJE"\) return "DISASSEMBLY"/);
  assert.match(action, /p_route_type: canonicalRouteType\(text\(data, "routeType"\)\)/);
});

test("vehicle and driver are nullable in the save payload", () => {
  assert.match(action, /p_asset_id: text\(data, "vehicleId"\) \|\| null/);
  assert.match(action, /p_driver_staff_id: text\(data, "driverId"\) \|\| null/);
});

test("route save logs server diagnostics without exposing them in the UI", () => {
  assert.match(action, /console\.error\("\[logistics-route-save\]"/);
  assert.match(action, /return "No fue posible guardar la ruta\./);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssignedBoxByProject,
  formatAssignedBoxLabel,
} from "../features/asset-management/box-assignment-read-model.ts";
import { buildEventEquipmentExtras } from "../features/projects/event-equipment-extras-read-model.ts";

test("formats only valid canonical box assignments", () => {
    const boxes = buildAssignedBoxByProject([
      {
        project_id: "rosario",
        assignment_status: "ASSIGNED",
        operational_assets: { asset_code: "CASE-02", asset_type: "BOX" },
      },
      {
        project_id: "abigail",
        assignment_status: "ASSIGNED",
        operational_assets: { asset_code: "CASE-01", asset_type: "CASE" },
      },
      {
        project_id: "invalid",
        assignment_status: "ASSIGNED",
        operational_assets: { asset_code: "CASE-99", asset_type: "BOX" },
      },
    ]);

    assert.equal(formatAssignedBoxLabel(boxes.get("rosario")), "Caja 2 · CASE-02");
    assert.equal(formatAssignedBoxLabel(boxes.get("abigail")), "Caja 1 · CASE-01");
    assert.equal(formatAssignedBoxLabel(boxes.get("invalid")), "Caja pendiente de asignar");
    assert.equal(formatAssignedBoxLabel(undefined), "Caja pendiente de asignar");
});

test("shows only actual service, active post-reservation, and accepted extra items", () => {
    assert.deepEqual(
      buildEventEquipmentExtras({
        serviceExtras: ["Imanes", "Sin extras"],
        postReservationExtras: [
          { name: "Libro de firmas", status: "ACTIVE" },
          { name: "No mostrar", status: "CANCELLED" },
        ],
        acceptedQuotationItems: [
          { item_type: "EXTRA", label: "QR digital" },
          { item_type: "SERVICE", label: "BBOX360" },
        ],
      }),
    ["Imanes", "Libro de firmas", "QR digital"],
  );
});

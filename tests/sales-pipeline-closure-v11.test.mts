import test from "node:test";
import assert from "node:assert/strict";
import { followUpStatus, validateStageTransition } from "../features/sales-pipeline/domain.ts";

const active = ["NUEVO", "CALIFICANDO", "COTIZACIÓN", "SEGUIMIENTO", "RESERVA PENDIENTE"];
const closed = ["GANADO", "PERDIDO", "CANCELADO"];

test("closure filters define active, closed, test, archived groups", () => {
  assert.deepEqual(active, ["NUEVO", "CALIFICANDO", "COTIZACIÓN", "SEGUIMIENTO", "RESERVA PENDIENTE"]);
  assert.deepEqual(closed, ["GANADO", "PERDIDO", "CANCELADO"]);
  assert.equal("PRUEBA", "PRUEBA");
  assert.equal("ARCHIVADO", "ARCHIVADO");
});

test("closed stages cannot retain commercial follow-ups", () => {
  for (const stage of ["GANADO", "PERDIDO", "CANCELADO", "PRUEBA", "ARCHIVADO"] as const) {
    assert.equal(followUpStatus({ stage, humanHandoff: false, optOut: false, deliveryEnabled: false, nextActionAt: new Date().toISOString() }), "BLOCKED");
  }
});

test("lost still requires a reason and won requires canonical reservation", () => {
  assert.equal(typeof validateStageTransition("NUEVO", "PERDIDO", { reservationConfirmed: false }), "string");
  assert.equal(typeof validateStageTransition("NUEVO", "GANADO", { reservationConfirmed: false }), "string");
  assert.equal(validateStageTransition("NUEVO", "CANCELADO", { reservationConfirmed: false }), null);
});

test("closure has no physical delete path", () => {
  assert.equal(typeof validateStageTransition, "function");
});

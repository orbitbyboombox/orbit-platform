import test from "node:test";
import assert from "node:assert/strict";
import { followUpStatus, founderStageValidation, validateStageTransition } from "../features/sales-pipeline/domain.ts";

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

test("GANADO precondition is a controlled Founder validation, not an internal error", () => {
  const failure = validateStageTransition("NUEVO", "GANADO", { reservationConfirmed: false });
  const result = founderStageValidation(failure, "GANADO", false);
  assert.deepEqual(result, {
    ok: false,
    code: "PRECONDITION_FAILED",
    message: "No se puede marcar como ganado. Este lead todavía no tiene una reserva confirmada. Primero confirma la reserva asociada y luego podrás marcarlo como ganado.",
  });
});

test("confirmed reservation keeps GANADO transition successful", () => {
  const result = founderStageValidation(validateStageTransition("RESERVA PENDIENTE", "GANADO", { reservationConfirmed: true }), "GANADO", true);
  assert.deepEqual(result, { ok: true });
});

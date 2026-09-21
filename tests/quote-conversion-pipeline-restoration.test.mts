import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertQuoteConversionReady,
  buildQuoteConversionReview,
} from "../features/commercial-hub/quote-conversion.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const actions = source("features/commercial-hub/actions.ts");
const reviewUi = source("features/commercial-hub/quote-conversion-review.tsx");
const orchestrator = source("features/projects/operations/confirmed-reservation-orchestrator.service.ts");
const operational = source("features/projects/operations/confirmed-reservation-pipeline.service.ts");
const customerActions = source("features/projects/actions/customer.actions.ts");

const snapshot = {
  quotation: { number: "QA-1", version: 1, acceptedAt: "2026-09-01T00:00:00Z" },
  customer: { company: "QA", email: "qa@example.com" },
  commercial: {
    event: { name: "QA", date: "2026-12-01", time: "20:00", location: "QA", city: "Santiago", durationHours: 3 },
    paymentCondition: "FIFTY_FIFTY",
  },
  items: [{ id: "service", itemType: "SERVICE", code: "CLASSIC", label: "Classic", quantity: 2, total: 580000 }],
};

test("quote conversion review does not block CASE-backed conversion on shell", () => {
  const review = buildQuoteConversionReview({ quoteId: "q", status: "ACCEPTED", snapshot });
  assert.equal(review.shellRequired, false);
  assert.doesNotThrow(() => assertQuoteConversionReady(review, {}));
});

test("review explains that resource capacity, not shell colour, gates conversion", () => {
  assert.doesNotMatch(reviewUi, /name="shellType"/);
  assert.doesNotMatch(reviewUi, /WHITE · Tótem blanco/);
  assert.doesNotMatch(reviewUi, /BLACK · Tótem negro/);
  assert.match(reviewUi, /recursos operacionales disponibles/);
  assert.match(reviewUi, /CONFIRMAR Y CREAR RESERVA/);
});

test("accepted quote uses one canonical orchestrator and preserves quantities before it", () => {
  assert.match(actions, /serviceLines:/);
  assert.match(actions, /resumeQuotationConversion/);
  assert.match(actions, /createCustomerProjectAction\(draft\)/);
  assert.match(actions, /confirmPersistedReservation/);
});

test("canonical orchestrator contains reservation, portal, Calendar and Drive stages", () => {
  for (const stage of ["RECORDS", "PORTAL", "GOOGLE_CALENDAR", "GOOGLE_DRIVE", "DASHBOARD"])
    assert.match(orchestrator, new RegExp(stage));
  assert.match(operational, /synchronizeConfirmedReservationCalendar/);
  assert.match(operational, /synchronizeConfirmedReservationDrive/);
});

test("secondary integration failures stay retryable instead of marking the saga completed", () => {
  assert.match(customerActions, /status === "FAIL"/);
  assert.match(customerActions, /checkpoint\(label, "FAIL"/);
  assert.match(customerActions, /confirmation\.warnings\.length/);
  assert.doesNotMatch(customerActions, /mark\("Confirmation", "PASS"\);[\s\S]*confirmation\.warnings/);
});

test("recovery is idempotent and resumes existing transaction/project", () => {
  assert.match(actions, /reservation_transactions/);
  assert.match(actions, /onConflict: "project_id,service_code"/);
  assert.match(actions, /transaction\.status === "COMPLETED"/);
  assert.match(actions, /completedStages: completed/);
});

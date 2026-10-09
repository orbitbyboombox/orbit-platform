import test from "node:test";
import assert from "node:assert/strict";
import {
  filterReceivables,
  isFutureReceivable,
  pendingReceivableTotal,
  sortFinishedReceivables,
  sortFutureReceivables,
} from "../features/accounts-receivable/receivables-view-model.ts";
import type { ReceivableInvoice } from "../features/accounts-receivable/types.ts";

function invoice(input: Partial<ReceivableInvoice> & Pick<ReceivableInvoice, "id" | "projectType" | "eventDate" | "dueDate" | "outstandingBalance">): ReceivableInvoice {
  return {
    invoiceNumber: input.id,
    customerId: input.id,
    customerName: input.id,
    customerCompany: null,
    customerEmail: null,
    customerSecondaryEmail: null,
    customerPhone: null,
    projectId: input.id,
    projectName: input.id,
    orbitEventId: input.id,
    customerType: "PRIVATE",
    status: "PENDING",
    amount: input.outstandingBalance,
    paidAmount: 0,
    issueDate: "2026-01-01",
    paymentTerm: "CASH",
    customTermDays: null,
    paymentCategory: "ORDENARIO_50",
    paymentCategorySource: "FALLBACK",
    canonicalPaymentTerm: "CASH",
    canonicalPaymentTermDays: 0,
    purchaseOrder: null,
    daysRemaining: input.dueDate && input.dueDate < "2026-10-09" ? -1 : 10,
    agingBucket: "CURRENT",
    version: 1,
    service: "Servicio",
    eventLocation: null,
    eventDuration: "",
    agreementId: null,
    contractAvailable: false,
    collectorId: null,
    collectorName: "Sin asignar",
    collectionActions: [],
    lastPayment: null,
    paymentHistory: [],
    ...input,
  };
}

test("por cobrar deduplica y concilia el saldo real", () => {
  const rows = [invoice({ id: "a", projectType: "WEDDING", eventDate: "2026-10-01", dueDate: "2026-09-01", outstandingBalance: 100 }), invoice({ id: "a", projectType: "WEDDING", eventDate: "2026-10-01", dueDate: "2026-09-01", outstandingBalance: 100 }), invoice({ id: "b", projectType: "CORPORATE_EVENT", eventDate: "2026-11-01", dueDate: "2026-11-15", outstandingBalance: 50 })];
  assert.equal(pendingReceivableTotal(rows), 150);
  assert.equal(filterReceivables(rows, "ALL").length, 2);
  assert.equal(filterReceivables(rows, "MARRIAGES").length, 1);
  assert.equal(filterReceivables(rows, "BUSINESS_EVENTS").length, 1);
});

test("eventos futuros usan event_date y no due_date para separar vistas", () => {
  const future = invoice({ id: "future", projectType: "EVENT", eventDate: "2026-12-01", dueDate: "2026-09-01", outstandingBalance: 100 });
  assert.equal(isFutureReceivable(future, "2026-10-09"), true);
  assert.deepEqual(sortFutureReceivables([future]).map((row) => row.id), ["future"]);
});

test("terminados ordena vencidos primero y luego por vencimiento canónico", () => {
  const later = invoice({ id: "later", projectType: "EVENT", eventDate: "2026-09-01", dueDate: "2026-10-20", outstandingBalance: 100 });
  const overdue = invoice({ id: "overdue", projectType: "EVENT", eventDate: "2026-09-02", dueDate: "2026-09-20", outstandingBalance: 100 });
  assert.deepEqual(sortFinishedReceivables([later, overdue]).map((row) => row.id), ["overdue", "later"]);
});

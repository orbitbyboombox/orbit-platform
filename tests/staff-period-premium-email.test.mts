import test from "node:test";
import assert from "node:assert/strict";
import { executePeriodDelivery } from "../features/staff-monthly-account/period-delivery.protocol.ts";
import {
  periodDocumentInput,
  type PeriodDocumentPayload,
} from "../features/staff-monthly-account/period-document.model.ts";
import { buildStaffPeriodClosedEmail } from "../features/staff-communications/staff-email.templates.ts";
import { createStaffMonthlySettlementPdf } from "../features/staff-monthly-account/settlement-pdf.ts";
import { PDFDocument } from "pdf-lib";

function payload(code: "Q1" | "Q2" | "MONTH"): PeriodDocumentPayload {
  const detail = (day: string, net: number, paid: number) => ({
    settlementId: day,
    projectId: "event",
    eventDate: `2026-10-${day}`,
    event: "Evento QA",
    customer: "Cliente QA",
    service: "Classic",
    location: "Santiago",
    roles: ["SUPERVISOR"],
    hours: 4.5,
    workNet: net,
    workPaid: paid,
    reimbursements: day === "08" ? 5000 : 0,
    reimbursementsPaid: 0,
    reimbursementsPending: day === "08" ? 5000 : 0,
    advances: 0,
  });
  const monthly = {
    workNet: 55000,
    workPaid: 36000,
    workPending: 19000,
    boletaGross: 64897,
    withholdingRate: 15.25,
    withholdingAmount: 9897,
    reimbursementsTotal: 5000,
    reimbursementsPendingTotal: 5000,
    details: [detail("08", 36000, 36000), detail("20", 19000, 0)],
  };
  const block = (
    id: string,
    c: "Q1" | "Q2" | "MONTH",
    start: string,
    end: string,
    net: number,
  ) => ({
    id,
    account_id: "account",
    period_code: c,
    starts_on: `2026-10-${start}`,
    ends_on: `2026-10-${end}`,
    status: "FINALIZED" as const,
    closed_at: "2026-10-31T23:00:00Z",
    snapshot: {
      ...monthly,
      workNet: net,
      boletaNet: net,
      boletaGross: Math.round(net/(1-0.1525)),
      withholdingAmount: Math.round(net/(1-0.1525))-net,
      reimbursementsTotal:c==="Q2"?0:5000,
      reimbursementsPendingTotal:c==="Q2"?0:5000,
      workPaid:c==="MONTH"?36000:0,
      workPending: c === "Q1" ? 36000 : 19000,
      finalTransferAmount: c === "Q1" ? 36000 : 19000,
      eventCount: c === "MONTH" ? 2 : 1,
      details: monthly.details.filter(
        (d) =>
          d.eventDate >= `2026-10-${start}` && d.eventDate <= `2026-10-${end}`,
      ),
    },
  });
  return {
    account: {
      id: "account",
      staff_id: "staff",
      accounting_month: "2026-10-01",
    },
    period:
      code === "Q1"
        ? block("first", "Q1", "01", "14", 36000)
        : code === "Q2"
          ? block("second", "Q2", "15", "31", 19000)
          : block("month", "MONTH", "01", "31", 55000),
    monthly,
    first: block("first", "Q1", "01", "14", 36000),
    staff: {
      id: "staff",
      name: "Persona QA",
      firstName: "Persona <QA>",
      email: "staff@example.invalid",
      rut: "1-9",
      role: "Supervisor",
    },
    company: {
      legalName: "Empresa QA",
      taxId: "1-9",
      address: "Dirección QA",
      city: "Santiago",
    },
  };
}
test("Q2 boleta includes all fees, partial/first payments only reduce remaining", () => {
  assert.equal(periodDocumentInput(payload("Q1")).account.boletaGross,42478);
  const input = periodDocumentInput(payload("Q2"));
  assert.equal(input.account.boletaGross, 64897);
  assert.equal(input.periodSummary.firstWork, 36000);
  assert.equal(input.periodSummary.firstPaid, 36000);
  assert.equal(input.periodSummary.paid, 36000);
  assert.equal(input.periodSummary.remaining, 19000);
  assert.equal(input.periodSummary.reimbursementsPending, 5000);
  const changed = payload("Q2");
  changed.monthly.workPaid = 10000;
  changed.monthly.workPending = 45000;
  assert.equal(periodDocumentInput(changed).account.boletaGross, 64897);
  assert.equal(periodDocumentInput(changed).periodSummary.remaining, 45000);
  changed.monthly.workNet = 99999;
  assert.throws(() => periodDocumentInput(changed), /no concilian/);
});
test("Q1 email does not request boleta; monthly email requests a single full boleta", () => {
  for (const code of ["Q1", "Q2", "MONTH"] as const) {
    const p = payload(code),
      i = periodDocumentInput(p),
      s = i.periodSummary;
    const email = buildStaffPeriodClosedEmail({
      appUrl: "https://app.example.invalid",
      firstName: p.staff.firstName,
      periodLabel: i.periodTitle,
      firstQuincena: i.firstQuincena,
      periodWork: s.periodWork,
      monthlyWork: s.monthlyWork,
      monthlyGross: s.monthlyGross,
      paid: s.paid,
      remaining: s.remaining,
      reimbursementsPending: s.reimbursementsPending,
      company: p.company,
    });
    assert.ok(email.htmlBody.includes("Persona &lt;QA&gt;"));
    assert.ok(!email.htmlBody.includes("Persona <QA>"));
    if (code === "Q1") {
      assert.match(email.textBody, /no debes emitir ni subir boleta/);
      assert.doesNotMatch(email.textBody, /Boleta mensual bruta a emitir/);
      assert.doesNotMatch(email.htmlBody, /Subir boleta mensual/);
    } else {
      assert.match(email.textBody, /64\.897/);
      assert.match(email.textBody, /19\.000/);
      assert.match(email.textBody, /una sola boleta mensual/);
    }
  }
});
test("All premium PDF variants render, including a separate monthly consolidated page", async () => {
  for (const code of ["Q1", "Q2", "MONTH"] as const) {
    const bytes = await createStaffMonthlySettlementPdf(
      periodDocumentInput(payload(code)),
    );
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= (code === "Q1" ? 1 : 2));
  }
});
test("Concurrent close delivery attempts send only once; accepted message ID is required", async () => {
  let state = "PENDING",
    sent = 0;
  const history: string[] = [];
  const deps = {
    claim: async () => {
      if (state !== "PENDING") return false;
      state = "PREPARING";
      return true;
    },
    prepare: async () => ({
      evidence: { hash: "protected-pdf" },
      send: async () => {
        sent++;
        return { messageId: "gmail-1", threadId: "thread-1" };
      },
    }),
    mark: async (patch: Record<string, unknown>) => {
      state = String(patch.email_status);
      history.push(state);
    },
  };
  await Promise.all([executePeriodDelivery(deps), executePeriodDelivery(deps)]);
  assert.equal(sent, 1);
  assert.equal(state, "SENT");
  assert.deepEqual(history, ["SENDING", "SENT"]);
  await executePeriodDelivery(deps);
  assert.equal(sent, 1);
});
test("Preparation failure is safely retryable; ambiguous sends are quarantined", async () => {
  let state = "PENDING",
    sent = 0,
    prepareFails = true;
  const deps = {
    claim: async () => {
      if (state !== "PENDING") return false;
      state = "PREPARING";
      return true;
    },
    prepare: async () => {
      if (prepareFails) throw new Error("PDF storage failure");
      return {
        evidence: {},
        send: async () => {
          sent++;
          throw new Error("timeout after transmission");
        },
      };
    },
    mark: async (p: Record<string, unknown>) => {
      state = String(p.email_status);
    },
  };
  await executePeriodDelivery(deps);
  assert.equal(state, "PENDING");
  assert.equal(sent, 0);
  prepareFails = false;
  await executePeriodDelivery(deps);
  assert.equal(state, "UNKNOWN");
  assert.equal(sent, 1);
  await executePeriodDelivery(deps);
  assert.equal(sent, 1);
});
test("A failed SENT persistence never enables a duplicate send", async () => {
  let state = "PENDING",
    sent = 0;
  const deps = {
    claim: async () => {
      if (state !== "PENDING") return false;
      state = "PREPARING";
      return true;
    },
    prepare: async () => ({
      evidence: {},
      send: async () => {
        sent++;
        return { messageId: "1", threadId: "1" };
      },
    }),
    mark: async (p: Record<string, unknown>) => {
      if (p.email_status === "SENT") throw new Error("db failure");
      state = String(p.email_status);
    },
  };
  await executePeriodDelivery(deps);
  assert.equal(state, "UNKNOWN");
  await executePeriodDelivery(deps);
  assert.equal(sent, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveReceivablePaymentCategory,
  summarizeReceivablePaymentCategories,
} from "../features/accounts-receivable/payment-term-classification.ts";

test("corporate DAY_30 explícito en condición comercial de proyecto", () => {
  const result = resolveReceivablePaymentCategory({
    customerType: "CORPORATE",
    invoicePaymentTerm: "CASH",
    invoiceCustomTermDays: 0,
    projectFinance: { paymentCondition: "CORPORATE_CREDIT", paymentTermDays: 30 },
  });
  assert.equal(result.paymentCategory, "EMPRESA_30_DIAS");
  assert.equal(result.paymentCategorySource, "PROJECT_FINANCE");
  assert.equal(result.canonicalPaymentTerm, "DAYS_30");
});

test("proyectos corporativos con 30 días prevalecen sobre la factura legacy CASH", () => {
  const result = resolveReceivablePaymentCategory({
    customerType: "CORPORATE",
    invoicePaymentTerm: "CASH",
    invoiceCustomTermDays: 0,
    projectFinance: { paymentCondition: "CORPORATE_CREDIT", paymentTermDays: 30 },
  });
  assert.equal(result.paymentCategory, "EMPRESA_30_DIAS");
  assert.equal(result.paymentCategorySource, "PROJECT_FINANCE");
});

test("cliente particular con FIFTY_FIFTY se clasifica como ordinario", () => {
  const result = resolveReceivablePaymentCategory({
    customerType: "PRIVATE",
    invoicePaymentTerm: "CASH",
    invoiceCustomTermDays: 0,
    projectFinance: { paymentCondition: "FIFTY_FIFTY", paymentTermDays: 0 },
  });
  assert.equal(result.paymentCategory, "ORDENARIO_50");
  assert.equal(result.canonicalPaymentTerm, "CASH");
});

test("plazo comercial distinto de 30 días se clasifica como OTRO CRÉDITO", () => {
  const result = resolveReceivablePaymentCategory({
    customerType: "CORPORATE",
    invoicePaymentTerm: "CASH",
    invoiceCustomTermDays: 0,
    projectFinance: { paymentCondition: "CORPORATE_CREDIT", paymentTermDays: 45 },
  });
  assert.equal(result.paymentCategory, "OTRO_CREDITO");
  assert.equal(result.canonicalPaymentTerm, "DAYS_45");
});

test("resumen de categorías usa la suma de saldos sin duplicar filas", () => {
  const rows = [
    {
      outstandingBalance: 580_000,
      classification: resolveReceivablePaymentCategory({
        customerType: "CORPORATE",
        invoicePaymentTerm: "CASH",
        invoiceCustomTermDays: 0,
        projectFinance: { paymentCondition: "CORPORATE_CREDIT", paymentTermDays: 30 },
      }),
    },
    {
      outstandingBalance: 250_000,
      classification: resolveReceivablePaymentCategory({
        customerType: "CORPORATE",
        invoicePaymentTerm: "CASH",
        invoiceCustomTermDays: 0,
        projectFinance: { paymentCondition: "CORPORATE_CREDIT", paymentTermDays: 30 },
      }),
    },
    {
      outstandingBalance: 934_150,
      classification: resolveReceivablePaymentCategory({
        customerType: "CORPORATE",
        invoicePaymentTerm: "DAYS_30",
        invoiceCustomTermDays: 30,
        projectFinance: null,
      }),
    },
    {
      outstandingBalance: 238_000,
      classification: resolveReceivablePaymentCategory({
        customerType: "CORPORATE",
        invoicePaymentTerm: "CUSTOM",
        invoiceCustomTermDays: 45,
        projectFinance: null,
      }),
    },
    {
      outstandingBalance: 4_176_408,
      classification: resolveReceivablePaymentCategory({
        customerType: "CORPORATE",
        invoicePaymentTerm: "CASH",
        invoiceCustomTermDays: 0,
        projectFinance: { paymentCondition: "FIFTY_FIFTY", paymentTermDays: 0 },
      }),
    },
  ];
  const summary = summarizeReceivablePaymentCategories(
    rows.map(({ outstandingBalance, classification }) => ({
      outstandingBalance,
      paymentCategory: classification.paymentCategory,
    })),
  );
  assert.equal(summary.ordinary, 4_176_408);
  assert.equal(summary.days30, 1_764_150);
  assert.equal(summary.otherCredit, 238_000);
  assert.equal(summary.review, 0);
  assert.equal(summary.total, 6_178_558);
  assert.equal(
    summary.ordinary + summary.days30 + summary.otherCredit + summary.review,
    6_178_558,
  );
});

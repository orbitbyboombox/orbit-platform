type PaymentTerm =
  | "CASH"
  | "DAYS_15"
  | "DAYS_30"
  | "DAYS_45"
  | "DAYS_60"
  | "DAYS_90"
  | "CUSTOM";

export type ReceivablePaymentCategory =
  | "ORDENARIO_50"
  | "EMPRESA_30_DIAS"
  | "OTRO_CREDITO"
  | "CREDITO_SIN_PLAZO"
  | "REQUIERE_REVISIÓN";

export type ReceivablePaymentSource =
  | "PROJECT_FINANCE"
  | "INVOICE_TERM"
  | "FALLBACK";

export type PaymentClassificationSummary = {
  ordinary: number;
  days30: number;
  otherCredit: number;
  noTermCredit: number;
  review: number;
};

export type ReceivableCanonicalPayment = {
  paymentCategory: ReceivablePaymentCategory;
  paymentCategorySource: ReceivablePaymentSource;
  canonicalPaymentTerm: PaymentTerm;
  canonicalPaymentTermDays: number;
};

type ResolveParams = {
  customerType: "PRIVATE" | "CORPORATE";
  invoicePaymentTerm: string | null;
  invoiceCustomTermDays: number | null;
  projectFinance?: unknown;
};

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizePaymentCondition(
  value: unknown,
): "FIFTY_FIFTY" | "CASH" | "CORPORATE_CREDIT" | null {
  const normalized = normalizeString(value)?.toUpperCase();
  if (normalized === "FIFTY_FIFTY") return "FIFTY_FIFTY";
  if (normalized === "CORPORATE_CREDIT") return "CORPORATE_CREDIT";
  if (normalized === "CASH") return "CASH";
  return null;
}

function normalizeTermDays(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > -1)
    return Math.trunc(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > -1) return Math.trunc(parsed);
  }
  return null;
}

function normalizeInvoiceTerm(value: unknown): PaymentTerm {
  const normalized = normalizeString(value)?.toUpperCase();
  if (
    normalized === "CASH" ||
    normalized === "DAYS_15" ||
    normalized === "DAYS_30" ||
    normalized === "DAYS_45" ||
    normalized === "DAYS_60" ||
    normalized === "DAYS_90" ||
    normalized === "CUSTOM"
  )
    return normalized;
  return "CASH";
}

function paymentTermFromDays(days: number): PaymentTerm {
  return days === 15
    ? "DAYS_15"
    : days === 30
      ? "DAYS_30"
      : days === 45
        ? "DAYS_45"
        : days === 60
          ? "DAYS_60"
          : days === 90
            ? "DAYS_90"
            : "CUSTOM";
}

function classifyByDays(
  days: number,
  source: ReceivablePaymentSource,
): Omit<ReceivableCanonicalPayment, "paymentCategorySource"> & {
  source: ReceivablePaymentSource;
} {
  if (days <= 0 || Number.isNaN(days)) {
    return {
      paymentCategory: "REQUIERE_REVISIÓN",
      canonicalPaymentTerm: "CASH",
      canonicalPaymentTermDays: 0,
      source,
    };
  }
  if (days === 30) {
    return {
      paymentCategory: "EMPRESA_30_DIAS",
      canonicalPaymentTerm: "DAYS_30",
      canonicalPaymentTermDays: 30,
      source,
    };
  }
  return {
    paymentCategory: "OTRO_CREDITO",
    canonicalPaymentTerm: paymentTermFromDays(days),
    canonicalPaymentTermDays: days,
    source,
  };
}

export function resolveReceivablePaymentCategory({
  customerType,
  invoicePaymentTerm,
  invoiceCustomTermDays,
  projectFinance,
}: ResolveParams): ReceivableCanonicalPayment {
  const finance = toObject(projectFinance);
  const financeCondition = normalizePaymentCondition(finance?.paymentCondition);
  const financeTermDays = normalizeTermDays(
    finance?.paymentTermDays ?? finance?.termDays,
  );

  if (financeCondition === "CORPORATE_CREDIT") {
    if (!financeTermDays) {
      return {
        paymentCategory: "REQUIERE_REVISIÓN",
        paymentCategorySource: "PROJECT_FINANCE",
        canonicalPaymentTerm: "CASH",
        canonicalPaymentTermDays: 0,
      };
    }
    const resolved = classifyByDays(financeTermDays ?? 0, "PROJECT_FINANCE");
    return {
      paymentCategory: resolved.paymentCategory,
      paymentCategorySource: resolved.source,
      canonicalPaymentTerm: resolved.canonicalPaymentTerm,
      canonicalPaymentTermDays: resolved.canonicalPaymentTermDays,
    };
  }

  if (financeCondition === "FIFTY_FIFTY" || financeCondition === "CASH") {
    return {
      paymentCategory: "ORDENARIO_50",
      paymentCategorySource: "PROJECT_FINANCE",
      canonicalPaymentTerm: "CASH",
      canonicalPaymentTermDays: 0,
    };
  }

  if (financeTermDays && financeTermDays > 0) {
    const resolved = classifyByDays(financeTermDays, "PROJECT_FINANCE");
    return {
      paymentCategory: resolved.paymentCategory,
      paymentCategorySource: resolved.source,
      canonicalPaymentTerm: resolved.canonicalPaymentTerm,
      canonicalPaymentTermDays: resolved.canonicalPaymentTermDays,
    };
  }

  const invoiceTerm = normalizeInvoiceTerm(invoicePaymentTerm);
  if (invoiceTerm !== "CASH") {
    if (invoiceTerm === "CUSTOM") {
      const customTermDays = Math.max(0, normalizeTermDays(invoiceCustomTermDays) ?? 0);
      if (customTermDays > 0) {
        const resolved = classifyByDays(customTermDays, "INVOICE_TERM");
        return {
          paymentCategory: resolved.paymentCategory,
          paymentCategorySource: resolved.source,
          canonicalPaymentTerm: resolved.canonicalPaymentTerm,
          canonicalPaymentTermDays: resolved.canonicalPaymentTermDays,
        };
      }
      return {
        paymentCategory: "REQUIERE_REVISIÓN",
        paymentCategorySource: "INVOICE_TERM",
        canonicalPaymentTerm: "CUSTOM",
        canonicalPaymentTermDays: 0,
      };
    }

    const daysByTerm =
      invoiceTerm === "DAYS_15"
        ? 15
        : invoiceTerm === "DAYS_30"
          ? 30
          : invoiceTerm === "DAYS_45"
            ? 45
            : invoiceTerm === "DAYS_60"
              ? 60
              : invoiceTerm === "DAYS_90"
                ? 90
                : 0;
    const resolved = classifyByDays(daysByTerm, "INVOICE_TERM");
    return {
      paymentCategory:
        customerType === "CORPORATE"
          ? resolved.paymentCategory
          : resolved.paymentCategory === "REQUIERE_REVISIÓN"
            ? "REQUIERE_REVISIÓN"
            : resolved.paymentCategory,
      paymentCategorySource: resolved.source,
      canonicalPaymentTerm: resolved.canonicalPaymentTerm,
      canonicalPaymentTermDays: resolved.canonicalPaymentTermDays,
    };
  }

  return {
    paymentCategory: "ORDENARIO_50",
    paymentCategorySource: "FALLBACK",
    canonicalPaymentTerm: invoiceTerm,
    canonicalPaymentTermDays: 0,
  };
}

export function summarizeReceivablePaymentCategories(
  rows: readonly { outstandingBalance: number; paymentCategory: ReceivablePaymentCategory }[],
): PaymentClassificationSummary & { total: number } {
  const summary: PaymentClassificationSummary = rows.reduce(
    (acc, row) => {
      if (row.paymentCategory === "EMPRESA_30_DIAS")
        acc.days30 += row.outstandingBalance;
      else if (row.paymentCategory === "OTRO_CREDITO")
        acc.otherCredit += row.outstandingBalance;
      else if (row.paymentCategory === "CREDITO_SIN_PLAZO")
        acc.noTermCredit += row.outstandingBalance;
      else if (row.paymentCategory === "REQUIERE_REVISIÓN")
        acc.review += row.outstandingBalance;
      else acc.ordinary += row.outstandingBalance;
      return acc;
    },
    { ordinary: 0, days30: 0, otherCredit: 0, noTermCredit: 0, review: 0 },
  );
  return {
    ...summary,
    total: summary.ordinary + summary.days30 + summary.otherCredit + summary.noTermCredit + summary.review,
  };
}

export function isCompanyCreditPaymentCategory(category: ReceivablePaymentCategory): boolean {
  return category === "EMPRESA_30_DIAS" || category === "OTRO_CREDITO";
}

export function paymentCategoryLabel(category: ReceivablePaymentCategory): string {
  return category === "EMPRESA_30_DIAS"
    ? "EMPRESA · 30 DÍAS"
    : category === "OTRO_CREDITO"
      ? "OTRO CRÉDITO"
      : category === "CREDITO_SIN_PLAZO"
        ? "EMPRESA · SIN PLAZO"
      : category === "REQUIERE_REVISIÓN"
        ? "REQUIERE REVISIÓN"
        : "SALDO 50% / ORDINARIO";
}

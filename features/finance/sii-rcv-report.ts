import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { parseSiiRcv } from "./sii-rcv";

type Document = ReturnType<typeof parseSiiRcv>["documents"][number];
export type RcvEvidence = { document_key: string; match_status: "MATCHED" | "AMBIGUOUS" | "PENDING"; project_id: string | null; pdf_id: string | null; xml_id: string | null; paid: number | null; balance: number | null; expense_id: string | null };
export type RcvReportRow = { register: "Compras" | "Ventas"; snapshot: Document; has_difference: boolean; expense_category: string | null; evidence?: RcvEvidence };
export const siiCompanyRut = "765652723";

export function periodBounds(period: string) {
  if (!/^[1-9]\d{3}(?:-(?:0[1-9]|1[0-2]))?$/.test(period)) throw new Error("Período contable inválido.");
  const [year, month] = period.split("-").map(Number);
  const nextYear = month !== undefined && month < 12 ? year : year + 1;
  const nextMonth = month !== undefined && month < 12 ? month + 1 : 1;
  return { start: `${year}-${String(month ?? 1).padStart(2, "0")}-01`, end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01` };
}

export async function loadRcvReport(period: string): Promise<RcvReportRow[]> {
  const { start, end } = periodBounds(period);
  const request = createAdminClient().rpc("sii_rcv_period_documents" as never, {
    p_company: siiCompanyRut, p_start: start, p_end: end,
  } as never, { count: "exact" });
  const [{ data, count, error }, categories, matches] = await Promise.all([
    request,
    createAdminClient().rpc("sii_rcv_purchase_category_report" as never, {
      p_company: siiCompanyRut, p_start: start, p_end: end,
    } as never, { count: "exact" }),
    createAdminClient().rpc("sii_rcv_match_internal" as never, { p_company: siiCompanyRut, p_start: start, p_end: end } as never, { count: "exact" }),
  ]);
  const rows = (data ?? []) as RcvReportRow[];
  if (error || count === null || count > rows.length) throw new Error("El registro SII del período no se pudo recuperar completo.");
  const categoryRows = (categories.data ?? []) as { document_key: string; category: string }[];
  if (categories.error || categories.count === null || categories.count > categoryRows.length) {
    throw new Error("No se pudieron consultar las categorías administrativas.");
  }
  const mapped = new Map(categoryRows.map(item => [item.document_key, item.category]));
  const matchRows = (matches.data ?? []) as RcvEvidence[];
  if (matches.error || matches.count === null || matches.count !== rows.length || matchRows.length !== rows.length) {
    throw new Error("No se pudo consultar la evidencia financiera del período.");
  }
  const evidence = new Map(matchRows.map(item => [item.document_key, item]));
  return rows.map(row => ({ ...row, evidence: evidence.get(row.snapshot.key),
    expense_category: row.register === "Compras" ? mapped.get(row.snapshot.key) ?? row.expense_category : row.expense_category }));
}

export function rcvEvidenceLabel(row?: RcvEvidence) {
  if (row?.match_status === "MATCHED") return "Coincidencia interna";
  return row?.match_status === "AMBIGUOUS" ? "Coincidencias múltiples · revisar" : "Sin coincidencia exacta";
}

export function summarizeRcvAmounts(rows: RcvReportRow[]) {
  const fields = ["net", "exempt", "vat", "nonRecoverableVat", "total"] as const;
  return (["Compras", "Ventas"] as const).map(register => {
    const documents = rows.filter(row => row.register === register);
    const ordinary = documents.filter(row => !["56", "61"].includes(row.snapshot.code));
    const totals = fields.map(field => {
      const known = ordinary.flatMap(row => row.snapshot[field] ?? []);
      return { field, amount: known.length ? known.reduce((sum, value) => sum + value, 0) : null,
        missing: ordinary.length - known.length };
    });
    return { register, totals, adjustments: documents.length - ordinary.length };
  });
}

export async function loadStaffPeriodAmounts(period: string) {
  const { start, end } = periodBounds(period);
  const { data, error, count } = await createAdminClient().from("staff_period_payments")
    .select("amount,withholding_amount", { count: "exact" })
    .gte("tax_period", start).lt("tax_period", end).order("id");
  if (error || count === null || count > (data?.length ?? 0)) throw new Error("No se pudo obtener el total de pagos Staff.");
  let paid = 0, withheld = 0, withAmount = 0;
  for (const row of data ?? []) {
    paid += Number(row.amount);
    if (row.withholding_amount != null) {
      withheld += Number(row.withholding_amount);
      withAmount++;
    }
  }
  return { paid, withheld: withAmount ? withheld : null, missing: (count ?? 0) - withAmount };
}

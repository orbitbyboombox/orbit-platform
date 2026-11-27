import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { periodBounds, siiCompanyRut } from "./sii-rcv-report";

type ReceivedFee = {
  id: string;
  issuer_rut: string;
  issuer_name: string;
  folio: string;
  issued_on: string;
  gross: number;
  withheld: number;
  net: number;
  has_pdf: boolean;
  staff_matches: number;
  staff_account_id: string | null;
  staff_amount_matches: boolean | null;
};

export async function loadReceivedFees(period: string) {
  const { start, end } = periodBounds(period);
  const { data, count, error } = await createAdminClient().rpc("sii_received_fees_report" as never, {
    p_company: siiCompanyRut, p_start: start, p_end: end,
  } as never, { count: "exact" });
  const rows = (data ?? []) as ReceivedFee[];
  if (error || count === null || count > rows.length) throw new Error("El registro de honorarios no se pudo recuperar completo.");
  return rows;
}

export function receivedFeeReview(row: ReceivedFee) {
  if (!row.staff_matches) return "Prestador sin coincidencia Staff";
  if (!row.staff_account_id) return "Vínculo Staff por revisar";
  if (row.staff_amount_matches === null) return "Liquidación sin desglose comparable";
  return row.staff_amount_matches ? "Importes coinciden con Staff" : "Diferencia con liquidación Staff";
}

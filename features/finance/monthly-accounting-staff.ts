import { createAdminClient } from "@/lib/supabase/admin";

// Called only after the export route verifies the administrative role.
export async function loadMonthlyAccountingStaff(period: string) {
  const admin = createAdminClient();
  const [accounts, payments] = await Promise.all([
    admin.from("staff_monthly_accounts")
      .select("id,staff_id,boleta_status,boleta_document_id,boleta_gross,withholding_rate,withholding_amount,boleta_net,settlement_status", { count: "exact" })
      .eq("accounting_month", `${period}-01`).order("id"),
    admin.from("staff_period_payments")
      .select("id,period_id,paid_on,tax_period,amount,gross_amount,withholding_rate,withholding_amount,receipt_document_id", { count: "exact" })
      .eq("tax_period", `${period}-01`).order("id"),
  ]);
  for (const result of [accounts, payments]) {
    if (result.error || (result.count ?? 0) > (result.data?.length ?? 0)) {
      throw new Error("El período Staff no se pudo recuperar completo.");
    }
  }
  const settlements = accounts.data ?? [];
  const transfers = payments.data ?? [];
  const periodIds = [...new Set(transfers.map(row => row.period_id))];
  const periods = periodIds.length
    ? await admin.from("staff_payment_periods").select("id,account_id,period_code").in("id", periodIds)
    : { data: [], error: null };
  if (periods.error) throw new Error("No se pudo vincular el período de los pagos Staff.");
  const byPeriod = new Map((periods.data ?? []).map(row => [row.id, row]));
  const attachments = new Map<string, string>();
  for (const row of settlements) if (row.boleta_document_id) attachments.set(row.boleta_document_id, "Boletas-Staff");
  for (const row of transfers) if (row.receipt_document_id) attachments.set(row.receipt_document_id, "Pagos-Staff");
  return {
    sheets: [
      { title: "Liquidaciones Staff", headers: ["cuenta", "staff", "estado_liquidacion", "estado_boleta", "bruto", "tasa_retencion", "retencion", "liquido", "documento_boleta", "respaldo"],
        rows: settlements.map(r => [r.id, r.staff_id, r.settlement_status, r.boleta_status, r.boleta_gross, r.withholding_rate, r.withholding_amount, r.boleta_net, r.boleta_document_id, r.boleta_document_id ? "Asociado" : "Sin boleta asociada"]) },
      { title: "Pagos Staff", headers: ["pago", "cuenta", "periodo_pago", "fecha_pago", "periodo_tributario", "monto", "bruto", "tasa_retencion", "retencion", "comprobante", "respaldo"],
        rows: transfers.map(r => [r.id, byPeriod.get(r.period_id)?.account_id ?? null, byPeriod.get(r.period_id)?.period_code ?? null, r.paid_on, r.tax_period, r.amount, r.gross_amount, r.withholding_rate, r.withholding_amount, r.receipt_document_id, r.receipt_document_id ? "Asociado" : "Sin comprobante asociado"]) },
    ],
    attachments,
    missingBoletas: settlements.filter(row => !row.boleta_document_id).map(row => row.id),
    missingReceipts: transfers.filter(row => !row.receipt_document_id).map(row => row.id),
  };
}

export async function readMonthlyAccountingAttachments(
  staffIds: Map<string, string>, expenseIds: string[], saleIds: string[],
  missingBoletas: string[], missingReceipts: string[],
) {
  const admin = createAdminClient();
  const fields = "id,storage_bucket,storage_path,mime_type";
  const [staff, expenses, sales] = await Promise.all([
    staffIds.size ? admin.from("staff_onboarding_documents").select(fields).in("id", [...staffIds.keys()]) : { data: [], error: null },
    expenseIds.length ? admin.from("documents").select(`${fields},expense_id,drive_file_id`, { count: "exact" }).in("expense_id", expenseIds).is("deleted_at", null).eq("is_current", true) : { data: [], error: null },
    saleIds.length ? admin.from("documents").select(`${fields},drive_file_id`).in("id", saleIds).is("deleted_at", null) : { data: [], error: null },
  ]);
  if (staff.error || expenses.error || sales.error || ("count" in expenses && (expenses.count ?? 0) > (expenses.data?.length ?? 0))) {
    throw new Error("No se pudo completar el inventario de respaldos.");
  }
  const candidates = [
    ...(staff.data ?? []).map(r => ({ ...r, folder: staffIds.get(r.id) ?? "Staff" })),
    ...(expenses.data ?? []).map(r => ({ ...r, folder: "Proveedores" })),
    ...(sales.data ?? []).map(r => ({ ...r, folder: "Ventas" })),
  ];
  const files: { path: string; bytes: Uint8Array }[] = [];
  const manifest: string[][] = [
    ...missingBoletas.map(id => ["Boletas-Staff", id, "Liquidación sin boleta asociada", ""]),
    ...missingReceipts.map(id => ["Pagos-Staff", id, "Pago sin comprobante asociado", ""]),
  ];
  const driveReferences = new Map([...expenses.data ?? [], ...sales.data ?? []].flatMap(row =>
    row.drive_file_id && /^[A-Za-z0-9_-]+$/.test(row.drive_file_id)
      ? [[row.id, `https://drive.google.com/open?id=${row.drive_file_id}`] as const]
      : [],
  ));
  const seen = new Set<string>();
  let remaining = 2_500_000;
  for (const row of candidates) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!row.storage_bucket || !row.storage_path) {
      manifest.push([row.folder, row.id, "Omitido: ubicación de almacenamiento ausente", ""]);
      continue;
    }
    if (files.length >= 30 || remaining <= 0) {
      manifest.push([row.folder, row.id, "Omitido: límite del ZIP", ""]);
      continue;
    }
    const response = await admin.storage.from(row.storage_bucket).download(row.storage_path);
    if (response.error || !response.data || !response.data.size) {
      manifest.push([row.folder, row.id, "Omitido: respaldo inaccesible o vacío", ""]);
      continue;
    }
    const ext = ({ "application/pdf": "pdf", "application/xml": "xml", "text/xml": "xml", "image/jpeg": "jpg", "image/png": "png" } as Record<string, string>)[row.mime_type || response.data.type];
    if (!ext) {
      manifest.push([row.folder, row.id, "Omitido: formato sin identificar o no admitido", ""]);
      continue;
    }
    if (response.data.size > remaining) {
      manifest.push([row.folder, row.id, "Omitido: tamaño supera el espacio disponible en el ZIP", ""]);
      continue;
    }
    const bytes = new Uint8Array(await response.data.arrayBuffer());
    const path = `Respaldos/${row.folder}/${row.id}.${ext}`;
    files.push({ path, bytes });
    remaining -= bytes.length;
    manifest.push([row.folder, row.id, "Incluido", path]);
  }
  for (const [id, folder] of staffIds) if (!seen.has(id)) manifest.push([folder, id, "Documento asociado no encontrado", ""]);
  for (const id of saleIds) if (!seen.has(id)) manifest.push(["Ventas", id, "Documento asociado no encontrado", ""]);
  const linkedExpenses = new Set((expenses.data ?? []).map(row => row.expense_id));
  for (const id of expenseIds) if (!linkedExpenses.has(id)) manifest.push(["Proveedores", id, "Gasto sin respaldo asociado", ""]);
  return { files, manifest: manifest.map(row => [...row, driveReferences.get(row[1]) ?? ""]) };
}

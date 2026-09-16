"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanySettings } from "@/features/company-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { createOfficeLeaseReceiptPdf } from "./receipt-pdf";
import type { OfficeLeaseSettings } from "./model";

export type OfficeRentActionResult = { ok: true; message: string } | { ok: false; error: string };

const allowedFiles = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const number = (form: FormData, key: string) => Number(form.get(key) ?? 0);
const checksum = (bytes: ArrayBuffer | Buffer) => createHash("sha256").update(bytes instanceof ArrayBuffer ? Buffer.from(bytes) : bytes).digest("hex");
const safeRequestId = (value: string) => /^[a-zA-Z0-9-]{16,80}$/.test(value) ? value : randomUUID();
const refresh = () => {
  revalidatePath("/office-rent");
  revalidatePath("/finance/cash-flow");
};

async function adminContext() {
  const client = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError) throw profileError;
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Acceso Founder/Admin requerido.");
  return { client, userId: auth.user.id };
}

function validatedFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Adjunta un comprobante PDF, JPG o PNG.");
  const extension = allowedFiles.get(file.type);
  if (!extension) throw new Error("El archivo debe ser PDF, JPG o PNG.");
  if (file.size > 15 * 1024 * 1024) throw new Error("El archivo supera el máximo de 15 MB.");
  return { file, extension };
}

function mapSettings(row: Record<string, unknown>): OfficeLeaseSettings {
  return {
    id: String(row.id),
    tenantLegalName: String(row.tenant_legal_name),
    tenantRut: String(row.tenant_rut),
    tenantAddress: String(row.tenant_address),
    tenantEmail: String(row.tenant_email ?? ""),
    tenantPhone: String(row.tenant_phone ?? ""),
    tenantRepresentative: String(row.tenant_representative ?? ""),
    contractStartDate: String(row.contract_start_date ?? ""),
    contractEndDate: String(row.contract_end_date ?? ""),
    observations: String(row.observations ?? ""),
    unitName: String(row.unit_name),
    propertyAddress: String(row.property_address ?? ""),
    concept: String(row.concept),
    monthlyAmount: Number(row.monthly_amount),
    commonExpensesIncluded: Boolean(row.common_expenses_included),
    dueDay: Number(row.due_day),
    mortgageCost: Number(row.mortgage_cost),
    commonExpensesCost: Number(row.common_expenses_cost),
    version: Number(row.version),
  };
}

async function generateReceiptForPayment(client: SupabaseClient, paymentId: string) {
  const [paymentResult, itemsResult, settingsResult, company] = await Promise.all([
    client.from("office_lease_payments").select("id,obligation_id,amount,paid_on,payment_method,observation,receipt_number,office_lease_obligations(period)").eq("id", paymentId).single(),
    client.from("office_lease_income_items").select("item_type,description,detail,amount,sort_order").eq("payment_id", paymentId).order("sort_order"),
    client.from("office_lease_settings").select("*").eq("settings_key", "PRIMARY").single(),
    loadCompanySettings(client),
  ]);
  if (paymentResult.error) throw paymentResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (settingsResult.error) throw settingsResult.error;
  const obligationValue = paymentResult.data.office_lease_obligations;
  const obligation = Array.isArray(obligationValue) ? obligationValue[0] : obligationValue;
  if (!obligation?.period) throw new Error("No fue posible resolver el periodo del pago.");
  const pdf = await createOfficeLeaseReceiptPdf({
    settings: mapSettings(settingsResult.data),
    company,
    payment: {
      receiptNumber: Number(paymentResult.data.receipt_number),
      paidOn: paymentResult.data.paid_on,
      amount: Number(paymentResult.data.amount),
      paymentMethod: paymentResult.data.payment_method,
      observation: paymentResult.data.observation ?? "",
      lineItems: (itemsResult.data ?? []).map((item) => ({
        itemType: item.item_type,
        description: item.description,
        detail: item.detail ?? "",
        amount: Number(item.amount),
      })),
    },
    period: obligation.period,
  });
  const receiptNumber = String(paymentResult.data.receipt_number).padStart(3, "0");
  const filename = `RECIBO_ARRIENDO_N-${receiptNumber}.pdf`;
  const path = `office-rent/receipts/${filename}`;
  const admin = createAdminClient();
  const upload = await admin.storage.from("orbit-documents").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upload.error) throw upload.error;
  const attached = await client.rpc("attach_office_lease_income_receipt", {
    p_payment_id: paymentId,
    p_storage_path: path,
    p_filename: filename,
    p_checksum: checksum(pdf),
  });
  if (attached.error) throw attached.error;
}

export async function saveOfficeLeaseSettingsAction(form: FormData): Promise<OfficeRentActionResult> {
  const started = Date.now();
  try {
    console.info(JSON.stringify({ level: "info", event: "office_rent_settings_start" }));
    const { client, userId } = await adminContext();
    const payload = {
      tenant_legal_name: text(form, "tenantLegalName"),
      tenant_rut: text(form, "tenantRut"),
      tenant_address: text(form, "tenantAddress"),
      tenant_email: text(form, "tenantEmail") || null,
      tenant_phone: text(form, "tenantPhone") || null,
      tenant_representative: text(form, "tenantRepresentative") || null,
      contract_start_date: text(form, "contractStartDate") || null,
      contract_end_date: text(form, "contractEndDate") || null,
      observations: text(form, "observations") || null,
      unit_name: text(form, "unitName"),
      property_address: text(form, "propertyAddress") || null,
      concept: text(form, "concept"),
      monthly_amount: number(form, "monthlyAmount"),
      common_expenses_included: form.get("commonExpensesIncluded") === "on",
      due_day: number(form, "dueDay"),
      mortgage_cost: number(form, "mortgageCost"),
      common_expenses_cost: number(form, "commonExpensesCost"),
      approval_reason: "Configuración de Arriendo Oficina actualizada por Founder/Admin",
      updated_by: userId,
    };
    if (!payload.tenant_legal_name || !payload.tenant_rut || !payload.tenant_address || !payload.unit_name || !payload.concept) throw new Error("Completa los datos obligatorios del arrendatario y arriendo.");
    if (payload.monthly_amount <= 0 || payload.mortgage_cost < 0 || payload.common_expenses_cost < 0) throw new Error("Revisa los montos de configuración.");
    if (payload.due_day < 1 || payload.due_day > 28) throw new Error("El día de vencimiento debe estar entre 1 y 28.");
    const version = number(form, "version");
    const { data, error } = await client.from("office_lease_settings").update(payload).eq("settings_key", "PRIMARY").eq("version", version).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("La configuración cambió en otra sesión. Recarga e inténtalo nuevamente.");
    const ensured = await client.rpc("ensure_office_lease_obligations", { p_through_month: new Date().toISOString().slice(0, 10) });
    if (ensured.error) throw ensured.error;
    refresh();
    console.info(JSON.stringify({ level: "info", event: "office_rent_settings_done", ms: Date.now() - started }));
    return { ok: true, message: "Configuración guardada y auditada." };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "office_rent_settings_failed", error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }));
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible guardar la configuración." };
  }
}

export async function registerOfficeLeasePaymentAction(form: FormData): Promise<OfficeRentActionResult> {
  const started = Date.now();
  const requestId = safeRequestId(text(form, "requestId"));
  let proofPath = "";
  try {
    console.info(JSON.stringify({ level: "info", event: "office_rent_payment_start", requestId }));
    const { client } = await adminContext();
    const selected = validatedFile(form);
    const bytes = await selected.file.arrayBuffer();
    proofPath = `office-rent/payments/${requestId}/proof.${selected.extension}`;
    const admin = createAdminClient();
    const upload = await admin.storage.from("orbit-documents").upload(proofPath, bytes, { contentType: selected.file.type, upsert: true });
    if (upload.error) throw upload.error;
    const registered = await client.rpc("register_office_lease_payment", {
      p_obligation_id: text(form, "obligationId"),
      p_amount: number(form, "amount"),
      p_paid_on: text(form, "paidOn"),
      p_payment_method: text(form, "paymentMethod"),
      p_observation: text(form, "observation"),
      p_proof_path: proofPath,
      p_proof_filename: selected.file.name,
      p_proof_mime_type: selected.file.type,
      p_proof_checksum: checksum(bytes),
      p_idempotency_key: requestId,
    });
    if (registered.error) {
      const linked = await admin.from("office_lease_documents").select("id").eq("storage_path", proofPath).maybeSingle();
      if (!linked.data) await admin.storage.from("orbit-documents").remove([proofPath]);
      throw registered.error;
    }
    const paymentId = String((registered.data as { id?: string } | null)?.id ?? "");
    if (!paymentId) throw new Error("El pago se registró sin identificador de conciliación.");
    let receiptPending = false;
    try {
      await generateReceiptForPayment(client, paymentId);
    } catch (receiptError) {
      receiptPending = true;
      console.error(JSON.stringify({ level: "error", event: "office_rent_receipt_pending", paymentId, error: receiptError instanceof Error ? receiptError.message : String(receiptError) }));
    }
    refresh();
    console.info(JSON.stringify({ level: "info", event: "office_rent_payment_done", paymentId, receiptPending, ms: Date.now() - started }));
    return { ok: true, message: receiptPending ? "Pago registrado. El recibo quedó pendiente y puede regenerarse sin duplicar el pago." : "Pago registrado y recibo generado correctamente." };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "office_rent_payment_failed", requestId, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }));
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible registrar el pago." };
  }
}

export async function generateOfficeLeaseReceiptAction(paymentId: string): Promise<OfficeRentActionResult> {
  try {
    const { client } = await adminContext();
    await generateReceiptForPayment(client, paymentId);
    refresh();
    return { ok: true, message: "Recibo generado correctamente." };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "office_rent_receipt_failed", paymentId, error: error instanceof Error ? error.message : String(error) }));
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible generar el recibo." };
  }
}

export async function uploadOfficeLeaseDocumentAction(form: FormData): Promise<OfficeRentActionResult> {
  const requestId = safeRequestId(text(form, "requestId"));
  let path = "";
  try {
    const { client } = await adminContext();
    const selected = validatedFile(form);
    const documentType = text(form, "documentType");
    if (!["CONTRACT", "ADDITIONAL"].includes(documentType)) throw new Error("Selecciona un tipo documental válido.");
    const bytes = await selected.file.arrayBuffer();
    path = `office-rent/documents/${requestId}.${selected.extension}`;
    const admin = createAdminClient();
    const upload = await admin.storage.from("orbit-documents").upload(path, bytes, { contentType: selected.file.type, upsert: false });
    if (upload.error) throw upload.error;
    const saved = await client.rpc("register_office_lease_document", {
      p_document_type: documentType,
      p_storage_path: path,
      p_filename: selected.file.name,
      p_mime_type: selected.file.type,
      p_checksum: checksum(bytes),
      p_idempotency_key: `office-rent-document:${requestId}`,
    });
    if (saved.error) {
      await admin.storage.from("orbit-documents").remove([path]);
      throw saved.error;
    }
    refresh();
    return { ok: true, message: "Documento guardado en el historial del arriendo." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible guardar el documento." };
  }
}

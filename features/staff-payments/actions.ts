"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { deriveCanonicalStaffHonorariaBalance } from "./canonical-staff-obligation";

type Result = { ok: true } | { ok: false; error: string };
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const friendly = (error: unknown, fallback: string) => error instanceof Error && !/violates|constraint|postgres|supabase|invalid input/i.test(error.message) ? error.message : fallback;

const paymentFileTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/**
 * Registers an event-level honorarium advance/payment against the canonical
 * settlement. The monthly projection is deliberately not used here: it can
 * include other events and reimbursements, while this action must reconcile
 * only the selected event's honorarium ledger.
 */
export async function registerQuickStaffSettlementPaymentAction(data: FormData): Promise<Result> {
  let path = "";
  try {
    const { client } = await context();
    const settlementId = text(data, "settlementId");
    const amount = Number(data.get("amount"));
    const paymentDate = text(data, "paymentDate");
    const method = text(data, "method");
    const reference = text(data, "reference");
    const file = data.get("file");
    if (!settlementId || !Number.isFinite(amount) || amount <= 0 || !paymentDate || !method || !(file instanceof File) || file.size === 0) {
      throw new Error("Completa monto, fecha, método y comprobante.");
    }
    if (!paymentFileTypes.has(file.type) || file.size > 15 * 1024 * 1024) {
      throw new Error("El comprobante debe ser PDF, JPG, PNG o WEBP y no superar 15 MB.");
    }

    const { data: financial, error: financialError } = await client
      .from("staff_settlement_financials")
      .select("settlement_id,staff_id,project_id,original_net,adjustment_total,paid_amount,remaining_balance,settlement_status")
      .eq("settlement_id", settlementId)
      .maybeSingle();
    if (financialError) throw financialError;
    if (!financial) throw new Error("La liquidación canónica no está disponible para pago.");

    const honorariaOutstanding = deriveCanonicalStaffHonorariaBalance({
      originalNet: Number(financial.original_net ?? 0),
      adjustmentTotal: Number(financial.adjustment_total ?? 0),
      paidAmount: Number(financial.paid_amount ?? 0),
    }).outstanding;
    if (honorariaOutstanding <= 0) throw new Error("No existe saldo de honorarios pendiente en esta liquidación.");
    if (amount > honorariaOutstanding) throw new Error(`El monto no puede superar el saldo de honorarios: $${Math.round(honorariaOutstanding).toLocaleString("es-CL")}.`);
    if (financial.settlement_status === "PAID") throw new Error("La liquidación ya figura pagada.");

    const bytes = await file.arrayBuffer();
    const fileHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    const idempotencyKey = createHash("sha256").update([settlementId, amount.toFixed(2), paymentDate, method, reference, fileHash].join("|")) .digest("hex");
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    path = `staff/${financial.staff_id}/05_COMPROBANTES_PAGO/${paymentDate.slice(0, 7)}/${idempotencyKey}.${extension}`;
    const admin = createAdminClient();
    const upload = await admin.storage.from("orbit-documents").upload(path, bytes, { contentType: file.type, upsert: true });
    if (upload.error) throw upload.error;

    const { error: rpcError } = await client.rpc("register_staff_advance_with_documents", {
      p_settlement_id: settlementId,
      p_amount: amount,
      p_date: paymentDate,
      p_method: method,
      p_notes: reference || "Pago rápido de honorarios Staff",
      p_idempotency_key: idempotencyKey,
      p_receipt_bucket: "orbit-documents",
      p_receipt_path: path,
      p_receipt_file_name: file.name,
      p_receipt_mime_type: file.type,
    });
    if (rpcError) {
      await admin.storage.from("orbit-documents").remove([path]);
      throw rpcError;
    }
    revalidatePath("/resources/staff");
    revalidatePath(`/projects/${financial.project_id}`);
    return { ok: true };
  } catch (error) {
    if (path) {
      try { await createAdminClient().storage.from("orbit-documents").remove([path]); } catch { /* best effort cleanup */ }
    }
    return { ok: false, error: friendly(error, "No fue posible registrar el abono de honorarios.") };
  }
}

async function context() {
  const client = await createSupabaseServerActionClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Administración puede gestionar pagos de Staff.");
  return { client, userId: data.user.id };
}

export async function addStaffSettlementAdjustmentAction(data: FormData): Promise<Result> {
  try {
    const { client } = await context();
    const paymentId = text(data, "paymentId"), reason = text(data, "adjustmentReason"), comment = text(data, "adjustmentComment");
    const direction = text(data, "adjustmentDirection") === "NEGATIVE" ? -1 : 1;
    const amount = Math.abs(Number(data.get("adjustmentAmount"))) * direction;
    if (!paymentId || !Number.isFinite(amount) || amount === 0 || !comment) throw new Error("Ingresa el ajuste, motivo y comentario.");
    const { data: payment, error: readError } = await client.from("event_staff_payments").select("project_id").eq("id", paymentId).is("deleted_at", null).single();
    if (readError) throw readError;
    const { error } = await client.rpc("add_staff_settlement_adjustment", { p_settlement_id: paymentId, p_reason: reason, p_amount: amount, p_comment: comment });
    if (error) throw error;
    revalidateSettlement(payment.project_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "No fue posible registrar el ajuste.") };
  }
}

export async function addStaffSettlementReimbursementAction(data: FormData): Promise<Result> {
  try {
    const { client, userId } = await context();
    const paymentId = text(data, "paymentId"), category = text(data, "reimbursementCategory"), description = text(data, "reimbursementDescription"), status = text(data, "reimbursementStatus");
    const amount = Number(data.get("reimbursementAmount"));
    if (!paymentId || !description || !Number.isFinite(amount) || amount <= 0) throw new Error("Ingresa la descripción y monto del reembolso.");
    if (!["FOOD", "PARKING", "FUEL", "TOLLS", "ACCOMMODATION", "OPERATIONAL_PURCHASES", "OTHER"].includes(category)) throw new Error("Categoría de reembolso inválida.");
    if (!["PENDING", "PAID"].includes(status)) throw new Error("Estado de reembolso inválido.");
    const { data: payment, error: readError } = await client.from("event_staff_payments").select("project_id,staff_id").eq("id", paymentId).eq("status", "CONFIRMED").is("deleted_at", null).single();
    if (readError) throw readError;
    const metadata = JSON.stringify({ description, source: "EVENT_STAFF_SETTLEMENT", reimbursementCategory: category, auditReason: "Reembolso operacional registrado desde la liquidación del Evento" });
    const { error } = await client.from("expenses").insert({ project_id: payment.project_id, responsible_staff_id: payment.staff_id, event_staff_settlement_id: paymentId, occurred_on: text(data, "reimbursementDate") || new Date().toISOString().slice(0, 10), category, supplier: "Reembolso Staff", subtotal: amount, vat: 0, total: amount, currency: "CLP", status, approval_reason: metadata, created_by: userId, updated_by: userId });
    if (error) throw error;
    revalidateSettlement(payment.project_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "No fue posible registrar el reembolso.") };
  }
}

function revalidateSettlement(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/resources/staff");
  revalidatePath("/operations");
  revalidatePath("/staff-portal");
  revalidatePath("/finance");
  revalidatePath("/finance/cash-flow");
  revalidatePath("/reports");
  revalidatePath("/");
}

export async function overrideStaffEventPaymentAction(data: FormData): Promise<Result> {
  try {
    const { client } = await context();
    const paymentId = text(data, "paymentId");
    const reason = text(data, "reason");
    const target = Math.max(0, Number(data.get("eventNet")));
    if (!paymentId || !reason || !Number.isFinite(target)) throw new Error("Ingresa el neto del Evento y el motivo.");
    const { data: payment, error: readError } = await client.from("event_staff_payments").select("project_id,operator_payment,assembly_payment,disassembly_payment").eq("id", paymentId).is("deleted_at", null).single();
    if (readError) throw readError;
    let operator = Number(payment.operator_payment), assembly = Number(payment.assembly_payment), disassembly = Number(payment.disassembly_payment);
    if (operator > 0) operator = Math.max(0, target - assembly - disassembly);
    else if (assembly > 0) assembly = Math.max(0, target - disassembly);
    else disassembly = target;
    const { error } = await client.rpc("set_staff_payment_override", { p_payment_id: paymentId, p_operator: operator, p_assembly: assembly, p_disassembly: disassembly, p_reason: reason });
    if (error) throw error;
    revalidateSettlement(payment.project_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "No fue posible ajustar el pago operacional.") };
  }
}

export async function overrideStaffAssignmentPaymentAction(data: FormData): Promise<Result> {
  try {
    const { client } = await context();
    const paymentId = text(data, "paymentId");
    const role = text(data, "paymentRole");
    const reason = text(data, "paymentReason");
    const amount = Number(data.get("paymentAmount"));
    if (!paymentId || !role || !reason || !Number.isFinite(amount) || amount < 0) throw new Error("Ingresa el monto y el motivo del pago especial.");
    const { data: payment, error: readError } = await client.from("event_staff_payments").select("project_id").eq("id", paymentId).is("deleted_at", null).single();
    if (readError) throw readError;
    const { error } = await client.rpc("set_staff_assignment_payment_override", { p_payment_id: paymentId, p_role: role, p_amount: amount, p_reason: reason });
    if (error) throw error;
    revalidateSettlement(payment.project_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "No fue posible guardar el pago personalizado.") };
  }
}

export async function resetStaffAssignmentPaymentAction(data: FormData): Promise<Result> {
  try {
    const { client } = await context();
    const paymentId = text(data, "paymentId");
    const role = text(data, "paymentRole");
    if (!paymentId || !role) throw new Error("No se pudo identificar el pago.");
    const { data: payment, error: readError } = await client.from("event_staff_payments").select("project_id").eq("id", paymentId).is("deleted_at", null).single();
    if (readError) throw readError;
    const { error } = await client.rpc("reset_staff_assignment_payment_override", { p_payment_id: paymentId, p_role: role });
    if (error) throw error;
    revalidateSettlement(payment.project_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "No fue posible restablecer la tarifa.") };
  }
}

export async function updateStaffEventSettlementAction(data: FormData): Promise<Result> {
  try {
    const { client } = await context();
    const paymentId = text(data, "paymentId"), movementType = text(data, "movementType"), receiptStatus = text(data, "receiptStatus");
    const amount = Math.max(0, Number(data.get("movementAmount")));
    if (!paymentId || !amount) throw new Error("Ingresa el nuevo movimiento de pago.");
    const { data: payment, error: readError } = await client.from("event_staff_payments").select("project_id").eq("id", paymentId).is("deleted_at", null).single();
    if (readError) throw readError;
    const { error } = await client.rpc("register_staff_settlement_movement", { p_settlement_id: paymentId, p_type: movementType, p_amount: amount, p_date: text(data, "paidAt") || null, p_method: text(data,"method"), p_notes: text(data,"notes") });
    if (error) throw error;
    const{error:receiptError}=await client.rpc("update_staff_settlement_receipt",{p_settlement_id:paymentId,p_receipt_status:receiptStatus});if(receiptError)throw receiptError;
    await client.rpc("refresh_staff_month_payment_state",{p_month:text(data,"accountingMonth")||new Date().toISOString().slice(0,7)+"-01"});revalidateSettlement(payment.project_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "No fue posible actualizar el pago del evento.") };
  }
}

export async function previewStaffMonthCloseAction(month:string){try{const{client}=await context();const{data,error}=await client.rpc("preview_staff_monthly_close",{p_month:`${month}-01`});if(error)throw error;return{ok:true,data}}catch(error){return{ok:false,error:friendly(error,"No fue posible revisar el cierre mensual.")}}}
export async function closeStaffMonthAction(month:string){try{const{client}=await context();const{data,error}=await client.rpc("close_staff_month",{p_month:`${month}-01`});if(error)throw error;revalidatePath("/resources/staff");return{ok:true,data}}catch(error){return{ok:false,error:friendly(error,"No fue posible cerrar el mes Staff.")}}}
export async function reopenStaffMonthAction(month:string,reason:string){try{const{client}=await context();const{data,error}=await client.rpc("reopen_staff_month",{p_month:`${month}-01`,p_reason:reason});if(error)throw error;revalidatePath("/resources/staff");return{ok:true,data}}catch(error){return{ok:false,error:friendly(error,"No fue posible reabrir el mes Staff.")}}}

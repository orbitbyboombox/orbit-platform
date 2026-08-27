"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import type { PaymentTerm } from "./types";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { createHash } from "node:crypto";

const maxReceiptBytes = 15 * 1024 * 1024;
const allowedReceiptTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
type Result = { ok: true } | { ok: false; error: string };
export type ReceivableMovementAction =
  | "DEPOSIT"
  | "PARTIAL_PAYMENT"
  | "FULL_PAYMENT"
  | "RETURN_PENDING"
  | "ARCHIVE"
  | "CANCEL"
  | "DELETE";
const fail = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error:
    error instanceof Error
      ? error.message
      : "No fue posible completar la operación.",
});

function paymentFailure(
  operation: string,
  error: unknown,
  context: { invoiceId?: string; projectId?: string } = {},
): { ok: false; error: string } {
  const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
  const detail =
    error && typeof error === "object"
      ? {
          code: "code" in error ? String(error.code ?? "") : null,
          message: "message" in error ? String(error.message ?? "") : String(error),
          details: "details" in error ? String(error.details ?? "") : null,
          hint: "hint" in error ? String(error.hint ?? "") : null,
        }
      : { code: null, message: String(error), details: null, hint: null };
  console.error(
    JSON.stringify({
      level: "error",
      event: "payment.entry.failed",
      operation,
      reference,
      ...context,
      error: detail,
      timestamp: new Date().toISOString(),
    }),
  );
  const message = detail.message || "No fue posible registrar el pago.";
  return { ok: false, error: `${message} · Referencia ${reference}` };
}

const normalizeMovementReason = (value: FormDataEntryValue | null, fallback = "Movimiento registrado por Founder") => {
  const text = String(value ?? fallback).trim();
  return text.length >= 3 ? text : fallback;
};

const movementMethod = (formData: FormData) => String(formData.get("method") || "TRANSFER");

function buildPaymentIdempotencyKey(parts: {
  invoiceId: string;
  action: ReceivableMovementAction | "MANUAL_PAYMENT";
  amount?: number;
  method: string;
  reason: string;
  targetPaymentId?: string;
  receiptChecksum?: string | null;
  requestId?: string;
}): string {
  const stableRequestId = (parts.requestId ?? "").trim();
  if (stableRequestId) {
    return createHash("sha256")
      .update(
        `phase1-request:${parts.invoiceId}|${parts.action}|${parts.amount ?? "-"}|${parts.method}|${parts.reason}|${parts.receiptChecksum ?? "-"}|${stableRequestId}`,
      )
      .digest("hex");
  }
  const source = [
    "phase1",
    parts.invoiceId,
    parts.action,
    parts.targetPaymentId ?? "-",
    typeof parts.amount === "number" ? String(parts.amount) : "-",
    parts.method,
    parts.reason,
    parts.receiptChecksum ?? "-",
  ]
    .join("|")
    .toLowerCase();
  return createHash("sha256").update(source).digest("hex");
}

async function detectReceipt(file: File | null): Promise<{
  checksum: string | null;
  storagePath: string | null;
  bytes: Uint8Array | null;
  mimeType: string | null;
  extension: string | null;
}> {
  if (!(file instanceof File) || file.size === 0) {
    return { checksum: null, storagePath: null, bytes: null, mimeType: null, extension: null };
  }
  if (file.size > maxReceiptBytes) {
    throw new Error("El comprobante no puede superar 15 MB.");
  }
  if (!allowedReceiptTypes.has(file.type)) {
    throw new Error("El comprobante debe ser JPG, PNG, WEBP o PDF.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = (file.name.split(".").pop() || "bin").toLowerCase();
  return {
    checksum: createHash("sha256").update(bytes).digest("hex"),
    storagePath: null,
    bytes,
    mimeType: file.type || "application/octet-stream",
    extension,
  };
}

function canonicalReceiptStoragePath(
  invoiceId: string,
  idempotencyKey: string,
  extension: string | null,
) {
  return extension ? `receivables/${invoiceId}/${idempotencyKey}.${extension}` : null;
}

async function upsertReceiptToStorage(
  client: Awaited<ReturnType<typeof createSupabaseServerActionClient>>,
  storagePath: string | null,
  bytes: Uint8Array | null,
  mimeType: string | null,
) {
  if (!storagePath || !bytes || !mimeType) {
    return;
  }
  const { error: uploadError } = await client.storage.from("orbit-documents").upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (uploadError) throw uploadError;
}

async function ensureNoDuplicatePaymentByIdempotency(
  client: Awaited<ReturnType<typeof createSupabaseServerActionClient>>,
  invoiceId: string,
  idempotencyKey: string,
) {
  const { data: existing } = await client
    .from("invoice_payments")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("idempotency_key", idempotencyKey)
    .is("deleted_at", null)
    .maybeSingle();
  return !!existing?.id;
}

async function removeUploadedReceipt(
  client: Awaited<ReturnType<typeof createSupabaseServerActionClient>>,
  storagePath: string | null,
) {
  if (!storagePath) return;
  try {
    await client.storage.from("orbit-documents").remove([storagePath]);
  } catch {
    // best-effort cleanup on retry/error paths.
  }
}
export async function createInvoiceAction(formData: FormData): Promise<Result> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const projectId = String(formData.get("projectId") ?? "");
    const term = String(formData.get("paymentTerm") ?? "CASH") as PaymentTerm;
    const custom = Number(formData.get("customTermDays") || 0) || null;
    const { data: project, error } = await client
      .from("projects")
      .select(
        "id,customer_id,orbit_event_id,customers(company),quotations(id,status,grand_total,final_customer_price),agreements(id)",
      )
      .eq("id", projectId)
      .single();
    if (error) throw error;
    const quotes = (project.quotations ?? []).filter(
      (q: { status: string }) => q.status === "ACCEPTED",
    );
    const quote = quotes.at(-1);
    if (!quote) throw new Error("El evento necesita una cotización aprobada.");
    const customer = Array.isArray(project.customers)
      ? project.customers[0]
      : project.customers;
    const customerType = customer?.company ? "CORPORATE" : "PRIVATE";
    if (customerType === "PRIVATE" && term !== "CASH")
      throw new Error("Los clientes privados no admiten crédito.");
    const year = new Date().getFullYear();
    const { count } = await client
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${year}-01-01`)
      .lt("created_at", `${year + 1}-01-01`);
    const invoiceNumber = `FAC-${year}-${String((count ?? 0) + 1).padStart(6, "0")}`;
    const { error: insert } = await client.from("invoices").insert({
      invoice_number: invoiceNumber,
      customer_id: project.customer_id,
      project_id: project.id,
      quotation_id: quote.id,
      agreement_id: project.agreements?.at(-1)?.id ?? null,
      orbit_event_id: project.orbit_event_id,
      customer_type: customerType,
      status: String(formData.get("status")) === "ISSUED" ? "ISSUED" : "DRAFT",
      issue_date:
        String(formData.get("status")) === "ISSUED"
          ? new Date().toISOString().slice(0, 10)
          : null,
      payment_term: term,
      custom_term_days: custom,
      purchase_order:
        String(formData.get("purchaseOrder") ?? "").trim() || null,
      amount: Number(quote.final_customer_price ?? quote.grand_total),
      notes: String(formData.get("notes") ?? "").trim() || null,
      issued_by:
        String(formData.get("status")) === "ISSUED" ? auth.user.id : null,
      issued_at:
        String(formData.get("status")) === "ISSUED"
          ? new Date().toISOString()
          : null,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    });
    if (insert) throw insert;
    revalidate();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
export async function applyReceivableMovementAction(
  formData: FormData,
): Promise<Result> {
  let invoiceId = "";
  let projectId = "";
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    invoiceId = String(formData.get("invoiceId") ?? "").trim();
    projectId = String(formData.get("projectId") ?? "").trim();
    const action = String(
      formData.get("movementAction"),
    ) as ReceivableMovementAction;
    const receipt = await detectReceipt(formData.get("receipt") instanceof File ? (formData.get("receipt") as File) : null);
    const occurredOn = String(
      formData.get("occurredOn") || new Date().toISOString().slice(0, 10),
    );
    const method = movementMethod(formData);
    const reason = normalizeMovementReason(formData.get("reason"));
    const amount = Number(formData.get("amount") || 0);
    const occurredAt = `${occurredOn}T12:00:00-04:00`;
    const requestId = String(formData.get("requestId") || "").trim();
    const idempotencyKey = buildPaymentIdempotencyKey({
      invoiceId,
      action,
      amount,
      method,
      reason,
      receiptChecksum: receipt.checksum,
      requestId,
    });
    receipt.storagePath = canonicalReceiptStoragePath(invoiceId, idempotencyKey, receipt.extension);
    if (await ensureNoDuplicatePaymentByIdempotency(client, invoiceId, idempotencyKey)) {
      return { ok: true };
    }
    await upsertReceiptToStorage(client, receipt.storagePath, receipt.bytes, receipt.mimeType);
    const { error } = await client.rpc("apply_receivable_movement", {
      p_invoice_id: invoiceId,
      p_action: action,
      p_amount: amount,
      p_occurred_at: occurredAt,
      p_method: method,
      p_receipt_path: receipt.storagePath,
      p_receipt_checksum: receipt.checksum,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      await removeUploadedReceipt(client, receipt.storagePath);
      throw error;
    }
    revalidate();
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    return paymentFailure("APPLY_RECEIVABLE_MOVEMENT", error, { invoiceId, projectId });
  }
}
export async function registerReceivablePaymentAction(formData: FormData): Promise<Result> {
  let invoiceId = "";
  let projectId = "";
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    invoiceId = String(formData.get("invoiceId") ?? "").trim();
    projectId = String(formData.get("projectId") ?? "").trim();
    if (!invoiceId || !projectId) throw new Error("Falta identificar la cuenta por cobrar del Evento.");
    const receipt = await detectReceipt(formData.get("receipt") instanceof File ? (formData.get("receipt") as File) : null);
    const method = movementMethod(formData);
    const reason = normalizeMovementReason(formData.get("observation"), "Pago registrado desde Perfil del Cliente");
    const amount = Number(formData.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("El monto debe ser mayor a cero.");
    const paidOn = String(formData.get("paidOn") || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new Error("La fecha del pago no es válida.");
    const occurredOn = `${paidOn}T12:00:00-04:00`;
    const receiptInput = formData.get("receipt");
    const receiptName = receiptInput instanceof File ? receiptInput.name : null;
    const requestId = String(formData.get("requestId") || "").trim();
    const { data: receivable, error: receivableError } = await client
      .from("accounts_receivable_projection")
      .select("id,project_id,outstanding_balance,status")
      .eq("id", invoiceId)
      .eq("project_id", projectId)
      .single();
    if (receivableError) throw receivableError;
    if (["PAID", "CANCELLED", "ARCHIVED"].includes(String(receivable.status)))
      throw new Error("La cuenta por cobrar no admite nuevos pagos.");
    const outstanding = Number(receivable.outstanding_balance);
    if (!Number.isFinite(outstanding) || outstanding <= 0)
      throw new Error("La cuenta ya no tiene saldo pendiente.");
    if (amount > outstanding)
      throw new Error("El monto supera el saldo pendiente.");
    const movementAction: ReceivableMovementAction = amount === outstanding ? "FULL_PAYMENT" : "PARTIAL_PAYMENT";
    const idempotencyKey = buildPaymentIdempotencyKey({
      invoiceId,
      action: "MANUAL_PAYMENT",
      amount,
      method,
      reason,
      requestId,
      receiptChecksum: receipt.checksum,
    });
    receipt.storagePath = canonicalReceiptStoragePath(invoiceId, idempotencyKey, receipt.extension);
    if (await ensureNoDuplicatePaymentByIdempotency(client, invoiceId, idempotencyKey)) {
      return { ok: true };
    }
    await upsertReceiptToStorage(client, receipt.storagePath, receipt.bytes, receipt.mimeType);
    const { data: paymentId, error } = await client.rpc("apply_receivable_movement", {
      p_invoice_id: invoiceId,
      p_action: movementAction,
      p_amount: amount,
      p_occurred_at: occurredOn,
      p_method: method,
      p_receipt_path: receipt.storagePath,
      p_reason: reason,
      p_receipt_checksum: receipt.checksum,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      await removeUploadedReceipt(client, receipt.storagePath);
      throw error;
    }
    if (paymentId && receiptName) {
      const { error: receiptNameError } = await client
        .from("invoice_payments")
        .update({ receipt_name: receiptName })
        .eq("id", paymentId)
        .eq("invoice_id", invoiceId);
      if (receiptNameError) {
        console.warn(
          JSON.stringify({
            level: "warning",
            event: "payment.receipt_name_sync_failed",
            invoiceId,
            projectId,
            paymentId,
            error: receiptNameError.message,
          }),
        );
      }
    }
    revalidate();
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    return paymentFailure("REGISTER_MANUAL_PAYMENT", error, { invoiceId, projectId });
  }
}
export async function confirmReconciledPaymentAction(formData:FormData):Promise<Result>{
  let invoiceId="";let projectId="";
  try{
    const client=await createSupabaseServerActionClient();const{data:auth}=await client.auth.getUser();if(!auth.user)throw new Error("Sesión requerida.");
    const importId=String(formData.get("reconciliationId")||"");invoiceId=String(formData.get("invoiceId")||"");projectId=String(formData.get("projectId")||"");
    const{error}=await client.rpc("confirm_bank_reconciliation",{p_import_id:importId,p_invoice_id:invoiceId});if(error)throw error;
    revalidate();if(projectId)revalidatePath(`/projects/${projectId}`);revalidatePath("/finance/banking");return{ok:true};
  }catch(error){return paymentFailure("CONFIRM_BANK_RECONCILIATION",error,{invoiceId,projectId});}
}
export async function getReceivableContractUrlAction(invoiceId:string){try{const client=await createSupabaseServerActionClient();const{data:auth}=await client.auth.getUser();if(!auth.user)throw new Error("Sesión requerida.");const{data,error}=await client.from("invoices").select("project_id,projects!inner(agreements(id,signed_pdf_path,status))").eq("id",invoiceId).single();if(error)throw error;const project=Array.isArray(data.projects)?data.projects[0]:data.projects;const agreement=[...(project?.agreements??[])].reverse().find(item=>item.signed_pdf_path&&["SIGNED","COMMERCIAL_DOCUMENT"].includes(item.status));if(!agreement?.signed_pdf_path)throw new Error("El documento oficial aún no está disponible.");const signed=await client.storage.from("orbit-documents").createSignedUrl(agreement.signed_pdf_path,300);if(signed.error)throw signed.error;return{ok:true as const,url:signed.data.signedUrl};}catch(error){return{ok:false as const,error:fail(error).error};}}

export async function sendReceivableReminderAction(invoiceId:string):Promise<Result>{try{const client=await createSupabaseServerActionClient();const{data:auth}=await client.auth.getUser();if(!auth.user)throw new Error("Sesión requerida.");const{data,error}=await client.from("accounts_receivable_projection").select("id,invoice_number,customer_id,project_id,orbit_event_id,amount,paid_amount,outstanding_balance,due_date,status,customers(full_name,email),projects(name)").eq("id",invoiceId).single();if(error)throw error;if(["PAID","CANCELLED","ARCHIVED"].includes(data.status)||Number(data.outstanding_balance)<=0)throw new Error("Esta cuenta no tiene un saldo activo para recordar.");const customer=Array.isArray(data.customers)?data.customers[0]:data.customers;const project=Array.isArray(data.projects)?data.projects[0]:data.projects;if(!customer?.email)throw new Error("El cliente no tiene correo registrado.");const amount=new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(data.outstanding_balance));const subject=`Recordatorio de pago BOOMBOX · ${data.invoice_number}`;const eventUrl=`${process.env.NEXT_PUBLIC_APP_URL??"https://orbit.boom-box.cl"}/projects/${data.project_id}`;const textBody=`Hola ${customer.full_name},\n\nTe recordamos que el Evento ${project?.name??"BOOMBOX"} mantiene un saldo pendiente de ${amount}${data.due_date?` con vencimiento ${data.due_date}`:""}.\n\nSi ya realizaste el pago, puedes responder este correo con el comprobante.\n\nBOOMBOX`;
const htmlBody=`<main style="font-family:Arial,sans-serif;color:#171717;line-height:1.6"><p>Hola ${escapeHtml(customer.full_name)},</p><p>Te recordamos que el Evento <strong>${escapeHtml(project?.name??"BOOMBOX")}</strong> mantiene un saldo pendiente de <strong>${escapeHtml(amount)}</strong>${data.due_date?` con vencimiento ${escapeHtml(data.due_date)}`:""}.</p><p>Si ya realizaste el pago, puedes responder este correo con el comprobante.</p><p>BOOMBOX</p></main>`;const sent=await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({to:customer.email,subject,textBody,htmlBody,driveFileIds:[]});const{data:communication,error:communicationError}=await client.from("communications").insert({customer_id:data.customer_id,project_id:data.project_id,channel:"GMAIL",direction:"OUTBOUND",communication_type:"PAYMENT_REMINDER",thread_key:sent.threadId,subject,body:textBody,status:"SENT",external_message_id:sent.messageId,occurred_at:new Date().toISOString(),created_by:auth.user.id}).select("id").single();if(communicationError)throw communicationError;const timeline=await client.from("timeline_events").insert({customer_id:data.customer_id,project_id:data.project_id,orbit_event_id:data.orbit_event_id,event_type:"PAYMENT_REMINDER_SENT",title:"Recordatorio de pago enviado",description:`Recordatorio explícitamente enviado por Founder por ${amount}.`,actor_id:auth.user.id,actor_label:"Founder",source:"Gmail",action:"PAYMENT_REMINDER_SENT",entity_type:"Communication",entity_id:communication.id,human_message:"Recordatorio de pago enviado al cliente.",correlation_id:`payment-reminder:${communication.id}`,communication_id:communication.id,created_by:auth.user.id});if(timeline.error)throw timeline.error;revalidatePath("/finance/receivables");revalidatePath(`/projects/${data.project_id}`);void eventUrl;return{ok:true};}catch(error){return fail(error);}}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]!);

export type CollectionContactChannel="WHATSAPP"|"EMAIL"|"PHONE";
export async function recordCollectionContactAction(invoiceId:string,channel:CollectionContactChannel):Promise<Result>{
  try{
    const client=await createSupabaseServerActionClient();
    const{data:auth}=await client.auth.getUser();
    if(!auth.user)throw new Error("Sesión requerida.");
    const{data,error}=await client.from("accounts_receivable_projection").select("id,invoice_number,customer_id,project_id,orbit_event_id,outstanding_balance,customers(full_name)").eq("id",invoiceId).single();
    if(error)throw error;
    if(Number(data.outstanding_balance)<=0)throw new Error("Esta cuenta no tiene saldo pendiente.");
    const customer=Array.isArray(data.customers)?data.customers[0]:data.customers;
    const occurredAt=new Date().toISOString();
    const communicationType=`COLLECTION_${channel}_OPENED`;
    const subject=`Gestión de cobranza ${channel} · ${data.invoice_number}`;
    const{data:communication,error:communicationError}=await client.from("communications").insert({customer_id:data.customer_id,project_id:data.project_id,channel,direction:"OUTBOUND",communication_type:communicationType,thread_key:`collection-action:${crypto.randomUUID()}`,subject,body:`Founder inició contacto de cobranza con ${customer?.full_name??"Cliente"}.`,status:"INITIATED",occurred_at:occurredAt,created_by:auth.user.id}).select("id").single();
    if(communicationError)throw communicationError;
    const{error:timelineError}=await client.from("timeline_events").insert({customer_id:data.customer_id,project_id:data.project_id,orbit_event_id:data.orbit_event_id,event_type:communicationType,title:"Acción de cobranza iniciada",description:`Founder abrió ${channel} para gestionar el saldo pendiente.`,actor_id:auth.user.id,actor_label:"Founder",source:"Accounts Receivable",action:communicationType,entity_type:"Communication",entity_id:communication.id,human_message:`Acción de cobranza por ${channel} iniciada explícitamente por Founder.`,correlation_id:`collection-action:${communication.id}`,communication_id:communication.id,created_by:auth.user.id});
    if(timelineError)throw timelineError;
    revalidatePath("/finance/receivables");
    return{ok:true};
  }catch(error){return fail(error);}
}

export async function getReceivableReceiptUrlAction(path: string) {
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    if (!path.startsWith("receivables/")) throw new Error("Ruta de comprobante inválida.");
    const { data, error } = await client.storage.from("orbit-documents").createSignedUrl(path, 300);
    if (error) throw error;
    return { ok: true as const, url: data.signedUrl };
  } catch (error) { return { ok: false as const, error: fail(error).error }; }
}
export async function updateReceivableDatesAction(formData: FormData): Promise<Result> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const { error } = await client.rpc("update_receivable_dates", {
      p_invoice_id: String(formData.get("invoiceId")),
      p_payment_id: String(formData.get("paymentId") || "") || null,
      p_payment_date: String(formData.get("paymentDate") || "") || null,
      p_due_date: String(formData.get("dueDate") || "") || null,
      p_reason: String(formData.get("reason") || ""),
    });
    if (error) throw error;
    revalidate();
    return { ok: true };
  } catch (error) { return fail(error); }
}
export async function manageReceivablePaymentAction(formData: FormData): Promise<Result> {
  let invoiceId = "";
  let projectId = "";
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    invoiceId = String(formData.get("invoiceId"));
    const paymentId = String(formData.get("paymentId"));
    projectId = String(formData.get("projectId"));
    const action = String(formData.get("paymentAction"));
    const rawReason = normalizeMovementReason(formData.get("reason"));
    const method = movementMethod(formData);
    const paidOn = String(formData.get("paidOn") || "");
    const receipt = await detectReceipt(formData.get("receipt") instanceof File ? (formData.get("receipt") as File) : null);
    const receiptInput = formData.get("receipt");
    const receiptName = receiptInput instanceof File && receiptInput.size > 0 ? receiptInput.name : null;
    const receiptKey = receipt.checksum
      ? createHash("sha256").update(`payment-receipt-edit:${invoiceId}|${paymentId}|${receipt.checksum}`).digest("hex")
      : null;
    receipt.storagePath = receiptKey
      ? canonicalReceiptStoragePath(invoiceId, receiptKey, receipt.extension)
      : null;
    const amount = action === "EDIT" ? Number(formData.get("amount") || 0) : null;
    const occurredAt = paidOn ? `${paidOn}T12:00:00-04:00` : null;
    await upsertReceiptToStorage(client, receipt.storagePath, receipt.bytes, receipt.mimeType);
    const { error } = await client.rpc("manage_receivable_payment", {
      p_invoice_id: invoiceId,
      p_payment_id: paymentId,
      p_action: action,
      p_amount: amount,
      p_paid_at: occurredAt,
      p_method: action === "EDIT" ? method : null,
      p_receipt_path: receipt.storagePath,
      p_reason: rawReason,
    });
    if (error) {
      await removeUploadedReceipt(client, receipt.storagePath);
      throw error;
    }
    if (receiptName) {
      const { error: receiptNameError } = await client
        .from("invoice_payments")
        .update({ receipt_name: receiptName })
        .eq("id", paymentId)
        .eq("invoice_id", invoiceId);
      if (receiptNameError) console.warn(JSON.stringify({ level: "warning", event: "payment.receipt_name_sync_failed", invoiceId, projectId, paymentId, error: receiptNameError.message }));
    }
    revalidate();
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) { return paymentFailure("MANAGE_PAYMENT_MOVEMENT", error, { invoiceId, projectId }); }
}
export async function auditReceivableIntegrityAction(): Promise<
  | {
      ok: true;
      summary: {
        qa: number;
        duplicates: number;
        broken: number;
        total: number;
      };
    }
  | { ok: false; error: string }
> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data, error } = await client.rpc("audit_receivable_integrity");
    if (error) throw error;
    return {
      ok: true,
      summary: data as {
        qa: number;
        duplicates: number;
        broken: number;
        total: number;
      },
    };
  } catch (error) {
    return { ok: false, error: fail(error).error };
  }
}
export async function cleanupReceivableIntegrityAction(
  reason: string,
): Promise<Result> {
  try {
    const client = await createSupabaseServerActionClient();
    const { error } = await client.rpc("cleanup_receivable_integrity", {
      p_reason: reason,
    });
    if (error) throw error;
    revalidate();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
function revalidate() {
  revalidatePath("/finance/receivables");
  revalidatePath("/finance");
  revalidatePath("/reports");
  revalidatePath("/notifications");
  revalidatePath("/projects", "layout");
  revalidatePath("/customers", "layout");
}

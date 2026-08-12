"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import type { PaymentTerm } from "./types";
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
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const invoiceId = String(formData.get("invoiceId"));
    const projectId = String(formData.get("projectId"));
    const action = String(
      formData.get("movementAction"),
    ) as ReceivableMovementAction;
    const receipt = formData.get("receipt");
    let receiptPath: string | null = null;
    if (receipt instanceof File && receipt.size > 0) {
      if (receipt.size > 15 * 1024 * 1024)
        throw new Error("El comprobante no puede superar 15 MB.");
      const extension = receipt.name.split(".").pop()?.toLowerCase() || "bin";
      receiptPath = `receivables/${invoiceId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await client.storage
        .from("orbit-documents")
        .upload(receiptPath, receipt, {
          contentType: receipt.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
    }
    const occurredOn = String(
      formData.get("occurredOn") || new Date().toISOString().slice(0, 10),
    );
    const { error } = await client.rpc("apply_receivable_movement", {
      p_invoice_id: invoiceId,
      p_action: action,
      p_amount: Number(formData.get("amount") || 0),
      p_occurred_at: `${occurredOn}T12:00:00-04:00`,
      p_method: String(formData.get("method") || "TRANSFER"),
      p_receipt_path: receiptPath,
      p_reason: String(
        formData.get("reason") || "Movimiento registrado por Founder",
      ),
    });
    if (error) throw error;
    revalidate();
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
export async function registerReceivablePaymentAction(formData: FormData): Promise<Result> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const invoiceId = String(formData.get("invoiceId"));
    const projectId = String(formData.get("projectId"));
    const receipt = formData.get("receipt");
    let receiptPath: string | null = null;
    let receiptName: string | null = null;
    if (receipt instanceof File && receipt.size > 0) {
      if (receipt.size > 15 * 1024 * 1024) throw new Error("El comprobante no puede superar 15 MB.");
      receiptName = receipt.name;
      const extension = receipt.name.split(".").pop()?.toLowerCase() || "bin";
      receiptPath = `receivables/${invoiceId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await client.storage.from("orbit-documents").upload(receiptPath, receipt, { contentType: receipt.type, upsert: false });
      if (uploadError) throw uploadError;
    }
    const paidOn = String(formData.get("paidOn"));
    const { error } = await client.rpc("register_receivable_payment", {
      p_invoice_id: invoiceId,
      p_amount: Number(formData.get("amount")),
      p_paid_at: `${paidOn}T12:00:00-04:00`,
      p_method: String(formData.get("method") || "TRANSFER"),
      p_receipt_path: receiptPath,
      p_receipt_name: receiptName,
      p_observation: String(formData.get("observation") || ""),
    });
    if (error) throw error;
    revalidate();
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) { return fail(error); }
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
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const invoiceId = String(formData.get("invoiceId"));
    const paymentId = String(formData.get("paymentId"));
    const projectId = String(formData.get("projectId"));
    const action = String(formData.get("paymentAction"));
    const receipt = formData.get("receipt");
    let receiptPath: string | null = null;
    if (receipt instanceof File && receipt.size > 0) {
      if (receipt.size > 15 * 1024 * 1024) throw new Error("El comprobante no puede superar 15 MB.");
      const extension = receipt.name.split(".").pop()?.toLowerCase() || "bin";
      receiptPath = `receivables/${invoiceId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await client.storage.from("orbit-documents").upload(receiptPath, receipt, { contentType: receipt.type, upsert: false });
      if (uploadError) throw uploadError;
    }
    const paidOn = String(formData.get("paidOn") || "");
    const { error } = await client.rpc("manage_receivable_payment", {
      p_invoice_id: invoiceId,
      p_payment_id: paymentId,
      p_action: action,
      p_amount: action === "EDIT" ? Number(formData.get("amount")) : null,
      p_paid_at: action === "EDIT" ? `${paidOn}T12:00:00-04:00` : null,
      p_method: action === "EDIT" ? String(formData.get("method") || "") : null,
      p_receipt_path: receiptPath,
      p_reason: String(formData.get("reason") || ""),
    });
    if (error) throw error;
    revalidate();
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) { return fail(error); }
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

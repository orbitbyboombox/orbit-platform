"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { uploadReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedTypes = new Set(["FACTURA", "BOLETA", "NOTA_CREDITO", "NOTA_DEBITO"]);

export async function attachExternalTaxDocumentAction(formData: FormData) {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder o Administración puede adjuntar documentos tributarios.");
    const projectId = String(formData.get("projectId") ?? "");
    const invoiceId = String(formData.get("invoiceId") ?? "") || null;
    const taxType = String(formData.get("taxType") ?? "");
    const folio = String(formData.get("folio") ?? "").trim();
    const issueDate = String(formData.get("issueDate") ?? "");
    const customerName = String(formData.get("customerName") ?? "").trim();
    const customerTaxId = String(formData.get("customerTaxId") ?? "").trim();
    const observation = String(formData.get("observation") ?? "").trim();
    const net = Number(formData.get("netAmount"));
    const tax = Number(formData.get("taxAmount"));
    const total = Number(formData.get("totalAmount"));
    const file = formData.get("file");
    if (!allowedTypes.has(taxType) || !folio || !issueDate || !customerName || !customerTaxId) throw new Error("Completa los datos tributarios obligatorios.");
    if (![net, tax, total].every(Number.isFinite) || net < 0 || tax < 0 || total < 0 || net + tax !== total) throw new Error("Neto + IVA debe coincidir con el total.");
    if (!(file instanceof File) || !file.size) throw new Error("Adjunta el documento SII.");
    if (file.size > 20 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) throw new Error("Usa PDF, JPG o PNG de hasta 20 MB.");
    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin.from("projects").select("id,event_date,customers!inner(full_name)").eq("id", projectId).is("deleted_at", null).single();
    if (projectError) throw projectError;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const idempotencyKey = `external-sii|${taxType}|${folio.toUpperCase()}|${customerTaxId.replace(/[^0-9K]/gi, "").toUpperCase()}|${checksum}`;
    const { data: existing } = await admin.from("documents").select("id").eq("idempotency_key", idempotencyKey).is("deleted_at", null).maybeSingle();
    if (existing) return { ok: true as const, id: existing.id, duplicate: true };
    const documentId = crypto.randomUUID();
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const storagePath = `${projectId}/tax-documents/${documentId}.${extension}`;
    const upload = await admin.storage.from("orbit-documents").upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const relatedCustomer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
    const drive = await uploadReservationDocumentToDrive({ client: admin, projectId, customerName: relatedCustomer.full_name, eventDate: project.event_date, kind: "INVOICE", name: file.name, mimeType: file.type, bytes });
    const { data: id, error } = await client.rpc("register_external_tax_document", { p_document_id: documentId, p_project_id: projectId, p_invoice_id: invoiceId, p_tax_type: taxType, p_folio: folio, p_issue_date: issueDate, p_customer_name: customerName, p_customer_tax_id: customerTaxId, p_net_amount: net, p_tax_amount: tax, p_total_amount: total, p_observation: observation, p_storage_path: storagePath, p_checksum: checksum, p_drive_file_id: drive.id, p_original_filename: file.name, p_mime_type: file.type, p_idempotency_key: idempotencyKey });
    if (error) throw error;
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/customers");
    revalidatePath("/events");
    revalidatePath("/finance/receivables");
    return { ok: true as const, id: String(id), duplicate: false };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible adjuntar el documento SII." };
  }
}

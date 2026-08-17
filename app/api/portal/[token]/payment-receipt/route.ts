import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";
import { uploadReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";

const allowed = new Set(["image/jpeg", "image/png", "application/pdf"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const destination = new URL(`/p/${encodeURIComponent(token)}#payments`, request.nextUrl.origin);
  let storagePath = "";
  try {
    const portal = await loadCustomerPortal(token); if (!portal) throw new Error("Este enlace ya no está disponible.");
    const total = Number(portal.invoice?.amount ?? portal.quotation?.final_customer_price ?? portal.quotation?.grand_total ?? 0);
    const paid = Number(portal.invoice?.paid_amount ?? portal.project.finance?.totalPaid ?? 0);
    if (total > 0 && paid >= total) throw new Error("Este evento no tiene pagos pendientes.");
    const form = await request.formData(); const file = form.get("receipt");
    if (!(file instanceof File) || !file.size) throw new Error("Selecciona un comprobante.");
    if (!allowed.has(file.type)) throw new Error("El comprobante debe ser JPG, PNG o PDF.");
    if (file.size > 20 * 1024 * 1024) throw new Error("El comprobante no puede superar 20 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer()); const checksum = createHash("sha256").update(bytes).digest("hex");
    const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    storagePath = `${portal.access.project_id}/payment-receipts/${randomUUID()}.${extension}`;
    const admin = createAdminClient(); const { error: storageError } = await admin.storage.from("orbit-documents").upload(storagePath, bytes, { contentType: file.type, upsert: false }); if (storageError) throw storageError;
    const customer = Array.isArray(portal.project.customers) ? portal.project.customers[0] : portal.project.customers;
    const uploaded = await uploadReservationDocumentToDrive({ client: admin, projectId: portal.access.project_id, customerName: customer.full_name, eventDate: portal.project.event_date, kind: "PAYMENT_PROOF", name: file.name, mimeType: file.type, bytes });
    const { data: document, error: documentError } = await admin.from("documents").insert({
      project_id: portal.access.project_id,
      customer_id: portal.access.customer_id,
      invoice_id: portal.invoice?.id ?? null,
      orbit_event_id: portal.project.orbit_event_id,
      document_type: "PAYMENT_RECEIPT",
      storage_bucket: "orbit-documents",
      storage_path: storagePath,
      checksum,
      drive_file_id: uploaded.id,
    }).select("id").single();
    if (documentError) throw documentError;
    const correlation = `portal-payment-proof:${document.id}`;
    const { error: timelineError } = await admin.from("timeline_events").insert({ customer_id: portal.access.customer_id, project_id: portal.access.project_id, event_type: "PAYMENT_PROOF_UPLOADED", title: "Comprobante de pago recibido.", description: "El cliente adjuntó un comprobante para validación.", orbit_event_id: portal.project.orbit_event_id, actor_label: "Cliente", source: "Customer", action: "PAYMENT_PROOF_UPLOADED", entity_type: "Document", entity_id: document.id, human_message: "El cliente adjuntó un comprobante de pago.", correlation_id: correlation }); if (timelineError) throw timelineError;
    destination.searchParams.set("paymentUpload", "success");
  } catch (error) {
    if (storagePath) { try { await createAdminClient().storage.from("orbit-documents").remove([storagePath]); } catch {} }
    destination.searchParams.set("paymentUpload", "error"); destination.searchParams.set("message", error instanceof Error ? error.message : "No fue posible subir el comprobante.");
  }
  return NextResponse.redirect(destination, 303);
}

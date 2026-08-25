"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { archiveReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedPurchaseOrderTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export async function attachCustomerPurchaseOrderAction(formData: FormData) {
  let storagePath = "";
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .single();
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
      throw new Error("Solo Founder o Administración puede adjuntar una OC.");
    const projectId = String(formData.get("projectId") ?? "");
    const purchaseOrderNumber = String(
      formData.get("purchaseOrderNumber") ?? "",
    ).trim();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size)
      throw new Error("Adjunta la OC Cliente.");
    if (
      file.size > 20 * 1024 * 1024 ||
      !allowedPurchaseOrderTypes.has(file.type)
    )
      throw new Error("Usa PDF, JPG o PNG de hasta 20 MB.");
    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id,customer_id,event_date,customers!inner(full_name)")
      .eq("id", projectId)
      .is("deleted_at", null)
      .single();
    if (projectError) throw projectError;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const idempotencyKey = `customer-po|${projectId}|${checksum}|${purchaseOrderNumber.toUpperCase()}`;
    const { data: existing } = await admin
      .from("documents")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing)
      return {
        ok: true as const,
        id: existing.id,
        duplicate: true,
        driveArchived: true,
      };
    const documentId = crypto.randomUUID();
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    storagePath = `${projectId}/commercial/customer-purchase-orders/${documentId}.${extension}`;
    const upload = await admin.storage
      .from("orbit-documents")
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const { data: persistedId, error: registerError } = await client.rpc(
      "register_customer_purchase_order",
      {
        p_document_id: documentId,
        p_project_id: projectId,
        p_purchase_order_number: purchaseOrderNumber,
        p_storage_path: storagePath,
        p_checksum: checksum,
        p_original_filename: file.name,
        p_mime_type: file.type,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (registerError) {
      await admin.storage.from("orbit-documents").remove([storagePath]);
      storagePath = "";
      throw registerError;
    }
    const customer = Array.isArray(project.customers)
      ? project.customers[0]
      : project.customers;
    let driveArchived = false;
    let warning: string | undefined;
    try {
      const drive = await archiveReservationDocumentToDrive({
        client: admin,
        projectId,
        customerName: customer.full_name,
        eventDate: project.event_date,
        kind: "PURCHASE_ORDER",
        name: `OC Cliente - ${documentId.slice(0, 8)} - ${file.name}`,
        mimeType: file.type,
        bytes,
      });
      const { error: driveWriteError } = await admin
        .from("documents")
        .update({
          drive_file_id: drive.id,
          metadata: {
            source: "FOUNDER_UPLOAD",
            protected: true,
            driveArchiveStatus: "ARCHIVED",
            driveFolderPath: drive.folderPath,
          },
        })
        .eq("id", String(persistedId));
      if (driveWriteError) throw driveWriteError;
      driveArchived = true;
    } catch (driveError) {
      warning =
        "La OC quedó protegida en ORBIT; el archivo administrativo de Drive se reintentará por separado.";
      await admin
        .from("documents")
        .update({
          metadata: {
            source: "FOUNDER_UPLOAD",
            protected: true,
            driveArchiveStatus: "ERROR",
            driveArchiveError:
              driveError instanceof Error ? driveError.message : "Drive error",
          },
        })
        .eq("id", String(persistedId));
      console.error("[ORBIT][CUSTOMER_PO_DRIVE_ARCHIVE]", driveError);
    }
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/events");
    return {
      ok: true as const,
      id: String(persistedId),
      duplicate: false,
      driveArchived,
      warning,
    };
  } catch (error) {
    if (storagePath) {
      try {
        await createAdminClient().storage
          .from("orbit-documents")
          .remove([storagePath]);
      } catch {}
    }
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible adjuntar la OC Cliente.",
    };
  }
}

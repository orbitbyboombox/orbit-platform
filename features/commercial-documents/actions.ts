"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { archiveCustomerPurchaseOrder, recordCustomerPurchaseOrderDriveFailure } from "./customer-purchase-order-drive.service";
import { operationalErrorMessage, validateCustomerPurchaseOrderFile } from "./customer-purchase-order.model";

// Upload contract: application/pdf, image/jpeg, image/png. Validation stays centralized in the shared model.
async function founderSession() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    throw new Error("Solo Founder o Administración puede adjuntar una OC.");
  return { client, user: auth.user };
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/events");
}

async function archiveOrWarn(
  admin: ReturnType<typeof createAdminClient>,
  documentId: string,
  bytes?: Uint8Array,
): Promise<{ driveArchived: boolean; driveReused: boolean; warning?: string }> {
  try {
    const drive = await archiveCustomerPurchaseOrder({ admin, documentId, bytes });
    return { driveArchived: true, driveReused: drive.reused };
  } catch (error) {
    await recordCustomerPurchaseOrderDriveFailure(admin, documentId, error);
    console.error(JSON.stringify({
      level: "error",
      event: "customer_purchase_order.drive.failed",
      documentId,
      error: operationalErrorMessage(error, "Drive error"),
    }));
    return {
      driveArchived: false,
      driveReused: false,
      warning: "La OC quedó protegida en ORBIT; el archivo administrativo de Drive está pendiente de sincronización.",
    };
  }
}

export async function attachCustomerPurchaseOrderAction(formData: FormData) {
  let storagePath = "";
  let phase = "AUTHORIZATION";
  let projectId = "";
  try {
    const { client } = await founderSession();
    projectId = String(formData.get("projectId") ?? "");
    const purchaseOrderNumber = String(formData.get("purchaseOrderNumber") ?? "").trim();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Adjunta la OC Cliente.");
    phase = "VALIDATION";
    const validated = validateCustomerPurchaseOrderFile(file);
    const admin = createAdminClient();
    phase = "EVENT_ASSOCIATION";
    const { data: project, error: projectError } = await admin.from("projects")
      .select("id").eq("id", projectId).is("deleted_at", null).single();
    if (projectError || !project) throw projectError ?? new Error("Evento no encontrado.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const idempotencyKey = `customer-po|${projectId}|${checksum}|${purchaseOrderNumber.toUpperCase()}`;
    phase = "IDEMPOTENCY_LOOKUP";
    const { data: existing, error: existingError } = await admin.from("documents")
      .select("id,drive_sync_status")
      .eq("idempotency_key", idempotencyKey).is("deleted_at", null).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const drive = existing.drive_sync_status === "SYNCED"
        ? { driveArchived: true, driveReused: true }
        : await archiveOrWarn(admin, existing.id);
      refresh(projectId);
      return { ok: true as const, id: existing.id, duplicate: true, ...drive };
    }
    const documentId = crypto.randomUUID();
    storagePath = `${projectId}/commercial/customer-purchase-orders/${documentId}.${validated.extension}`;
    phase = "CANONICAL_STORAGE";
    const upload = await admin.storage.from("orbit-documents")
      .upload(storagePath, bytes, { contentType: validated.mimeType, upsert: false });
    if (upload.error) throw upload.error;
    phase = "METADATA_PERSISTENCE";
    const { data: persistedId, error: registerError } = await client.rpc("register_customer_purchase_order", {
      p_document_id: documentId,
      p_project_id: projectId,
      p_purchase_order_number: purchaseOrderNumber,
      p_storage_path: storagePath,
      p_checksum: checksum,
      p_original_filename: file.name,
      p_mime_type: validated.mimeType,
      p_file_size: file.size,
      p_idempotency_key: idempotencyKey,
    });
    if (registerError) throw registerError;
    const canonicalId = String(persistedId);
    if (canonicalId !== documentId) await admin.storage.from("orbit-documents").remove([storagePath]);
    storagePath = "";
    phase = "DRIVE_ARCHIVE";
    const drive = await archiveOrWarn(admin, canonicalId, canonicalId === documentId ? bytes : undefined);
    refresh(projectId);
    return { ok: true as const, id: canonicalId, duplicate: canonicalId !== documentId, ...drive };
  } catch (error) {
    if (storagePath) {
      try { await createAdminClient().storage.from("orbit-documents").remove([storagePath]); } catch {}
    }
    const underlying = operationalErrorMessage(error, "Error desconocido");
    console.error(JSON.stringify({
      level: "error",
      event: "customer_purchase_order.upload.failed",
      phase,
      projectId: projectId || undefined,
      error: underlying,
    }));
    const publicError = phase === "CANONICAL_STORAGE"
      ? "No fue posible guardar el archivo protegido. Intenta nuevamente."
      : phase === "METADATA_PERSISTENCE"
        ? "No fue posible registrar la OC en el Evento. Intenta nuevamente."
        : underlying;
    return { ok: false as const, error: publicError };
  }
}

export async function retryCustomerPurchaseOrderDriveAction(projectId: string, documentId: string) {
  let verifiedDocumentId: string | null = null;
  try {
    await founderSession();
    const admin = createAdminClient();
    const { data: document, error } = await admin.from("documents").select("id")
      .eq("id", documentId).eq("project_id", projectId)
      .eq("document_type", "CUSTOMER_PURCHASE_ORDER").is("deleted_at", null).single();
    if (error || !document) throw new Error("OC Cliente no encontrada.");
    verifiedDocumentId = document.id;
    const result = await archiveCustomerPurchaseOrder({ admin, documentId });
    refresh(projectId);
    return { ok: true as const, message: result.reused ? "Drive reconciliado sin duplicados." : "OC archivada en Drive." };
  } catch (error) {
    if (verifiedDocumentId) {
      try { await recordCustomerPurchaseOrderDriveFailure(createAdminClient(), verifiedDocumentId, error); } catch {}
    }
    return { ok: false as const, error: operationalErrorMessage(error, "No fue posible sincronizar Drive.") };
  }
}

"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { archiveReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { EVENT_DESIGN_TYPE } from "./model";

const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

async function founderSession() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) {
    throw new Error("Solo Founder o Administración puede gestionar los diseños del evento.");
  }
  return { client, user: auth.user };
}

async function loadProject(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  const { data, error } = await admin.from("projects")
    .select("id,customer_id,event_date,customers!inner(full_name)")
    .eq("id", projectId).is("deleted_at", null).single();
  if (error || !data) throw error ?? new Error("Evento no encontrado.");
  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  return { ...data, customerName: String(customer?.full_name ?? "Cliente") };
}

export async function uploadEventDesignAction(formData: FormData) {
  let storagePath = "";
  try {
    const { user } = await founderSession();
    const projectId = String(formData.get("projectId") ?? "");
    const file = formData.get("file");
    if (!projectId || !(file instanceof File) || !file.size) throw new Error("Selecciona el diseño del evento.");
    if (file.size > 20 * 1024 * 1024 || !allowedMimeTypes.has(file.type)) {
      throw new Error("Usa PDF, JPG, PNG o WEBP de hasta 20 MB.");
    }
    const admin = createAdminClient();
    const project = await loadProject(admin, projectId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const idempotencyKey = `event-design|${projectId}|${checksum}`;
    const { data: existing } = await admin.from("documents")
      .select("id,version,drive_sync_status")
      .eq("idempotency_key", idempotencyKey).is("deleted_at", null).maybeSingle();
    if (existing) {
      return { ok: true as const, id: existing.id, version: Number(existing.version ?? 1), duplicate: true, driveArchived: existing.drive_sync_status === "SYNCED" };
    }

    const documentId = crypto.randomUUID();
    const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
    storagePath = `${projectId}/event-designs/${documentId}.${extension}`;
    const upload = await admin.storage.from("orbit-documents").upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;

    const { data: latest } = await admin.from("documents")
      .select("version").eq("project_id", projectId).eq("document_type", EVENT_DESIGN_TYPE)
      .is("deleted_at", null).order("version", { ascending: false }).limit(1).maybeSingle();
    const version = Number(latest?.version ?? 0) + 1;
    const { data: inserted, error: insertError } = await admin.from("documents").insert({
      id: documentId,
      project_id: project.id,
      customer_id: project.customer_id,
      document_type: EVENT_DESIGN_TYPE,
      storage_bucket: "orbit-documents",
      storage_path: storagePath,
      checksum,
      created_by: user.id,
      uploaded_by: user.id,
      idempotency_key: idempotencyKey,
      original_filename: file.name,
      mime_type: file.type,
      file_size: file.size,
      version,
      is_current: true,
      workflow_status: "RECEIVED",
      drive_sync_status: "PENDING",
      metadata: { source: "EVENT_DESIGN_CENTER", uploadedAt: new Date().toISOString(), uploadedBy: user.id },
    }).select("id,version").single();
    if (insertError || !inserted) throw insertError ?? new Error("No fue posible registrar el diseño.");

    const { error: supersedeError } = await admin.from("documents")
      .update({ is_current: false })
      .eq("project_id", projectId).eq("document_type", EVENT_DESIGN_TYPE).neq("id", documentId)
      .is("deleted_at", null);
    if (supersedeError) {
      await admin.from("documents").delete().eq("id", documentId);
      await admin.storage.from("orbit-documents").remove([storagePath]);
      throw supersedeError;
    }

    storagePath = "";
    let driveArchived = false;
    let warning: string | undefined;
    try {
      const archived = await archiveReservationDocumentToDrive({
        client: admin,
        projectId,
        customerName: project.customerName,
        eventDate: String(project.event_date),
        kind: "DESIGN",
        name: `Diseño del evento V${version} - ${file.name}`,
        mimeType: file.type,
        bytes,
      });
      await admin.from("documents").update({ drive_file_id: archived.id, drive_folder_id: archived.folderId, drive_sync_status: "SYNCED", drive_sync_error: null, drive_synced_at: new Date().toISOString() }).eq("id", documentId);
      driveArchived = true;
    } catch (driveError) {
      await admin.from("documents").update({ drive_sync_status: "ERROR", drive_sync_error: driveError instanceof Error ? driveError.message : "No fue posible archivar en Drive." }).eq("id", documentId);
      warning = "El diseño quedó protegido en ORBIT; el archivo de Drive está pendiente de reintento.";
    }
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, id: String(inserted.id), version: Number(inserted.version), duplicate: false, driveArchived, warning };
  } catch (error) {
    if (storagePath) await createAdminClient().storage.from("orbit-documents").remove([storagePath]);
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible guardar el diseño." };
  }
}

export async function approveEventDesignAction(projectId: string, documentId: string) {
  try {
    const { user } = await founderSession();
    const admin = createAdminClient();
    const { data: item, error: readError } = await admin.from("documents").select("id,project_id,customer_id,orbit_event_id,version").eq("id", documentId).eq("project_id", projectId).eq("document_type", EVENT_DESIGN_TYPE).eq("is_current", true).is("deleted_at", null).single();
    if (readError || !item) throw readError ?? new Error("El diseño actual no está disponible.");
    const now = new Date().toISOString();
    const { error } = await admin.from("documents").update({ workflow_status: "APPROVED", approved_by: user.id, approved_at: now }).eq("id", item.id);
    if (error) throw error;
    await admin.from("timeline_events").insert({ customer_id: item.customer_id, project_id: item.project_id, event_type: "DESIGN_APPROVED", title: "Diseño del evento aprobado.", description: `Versión ${item.version} aprobada.`, orbit_event_id: item.orbit_event_id, actor_id: user.id, actor_label: "Administrador", source: "Administrator", action: "DESIGN_APPROVED", entity_type: "Document", entity_id: item.id, human_message: `Diseño del evento V${item.version} aprobado.`, correlation_id: crypto.randomUUID(), created_by: user.id });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, message: "Diseño aprobado." };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible aprobar el diseño." };
  }
}

export async function retryEventDesignDriveAction(projectId: string, documentId: string) {
  try {
    await founderSession();
    const admin = createAdminClient();
    const project = await loadProject(admin, projectId);
    const { data: document, error } = await admin.from("documents").select("id,storage_bucket,storage_path,original_filename,mime_type,version,drive_file_id").eq("id", documentId).eq("project_id", projectId).eq("document_type", EVENT_DESIGN_TYPE).is("deleted_at", null).single();
    if (error || !document) throw new Error("Diseño no encontrado.");
    const source = await admin.storage.from(document.storage_bucket ?? "orbit-documents").download(document.storage_path);
    if (source.error || !source.data) throw source.error ?? new Error("Archivo original no disponible.");
    const archived = await archiveReservationDocumentToDrive({ client: admin, projectId, customerName: project.customerName, eventDate: String(project.event_date), kind: "DESIGN", name: `Diseño del evento V${document.version} - ${document.original_filename ?? "archivo"}`, mimeType: document.mime_type ?? "application/octet-stream", bytes: new Uint8Array(await source.data.arrayBuffer()) });
    const { error: updateError } = await admin.from("documents").update({ drive_file_id: archived.id, drive_folder_id: archived.folderId, drive_sync_status: "SYNCED", drive_sync_error: null, drive_synced_at: new Date().toISOString() }).eq("id", document.id);
    if (updateError) throw updateError;
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, message: archived.reused ? "Archivo de Drive reconciliado sin duplicados." : "Archivo guardado en Drive." };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible reintentar Drive." };
  }
}

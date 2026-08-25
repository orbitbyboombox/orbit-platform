"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requiresPhotoStripDesign } from "@/features/business-core/catalog/service.catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { archivePhotoStripDesign, recordPhotoStripDriveFailure } from "./photo-strip-design.service";
import { PHOTO_STRIP_DESIGN_TYPE } from "./model";

const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

async function founderSession() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    throw new Error("Solo Founder o Administración puede gestionar el diseño.");
  return { client, user: auth.user };
}

async function eligibleProject(projectId: string) {
  const admin = createAdminClient();
  const { data: project, error } = await admin.from("projects")
    .select("id,project_services(service_code)")
    .eq("id", projectId).is("deleted_at", null).single();
  if (error) throw error;
  const codes = (project.project_services ?? []).map((item: {service_code:string}) => item.service_code);
  if (!requiresPhotoStripDesign(codes))
    throw new Error("Este Evento no usa un servicio con diseño de tira de fotos.");
  return { admin, project };
}

export async function uploadPhotoStripDesignAction(formData: FormData) {
  let storagePath = "";
  try {
    const { client } = await founderSession();
    const projectId = String(formData.get("projectId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Selecciona el diseño.");
    if (file.size > 20 * 1024 * 1024 || !allowedMimeTypes.has(file.type))
      throw new Error("Usa PDF, JPG, JPEG o PNG de hasta 20 MB.");
    const { admin } = await eligibleProject(projectId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const idempotencyKey = `photo-strip-design|${projectId}|${checksum}`;
    const { data: existing } = await admin.from("documents")
      .select("id,version,drive_sync_status")
      .eq("idempotency_key", idempotencyKey).is("deleted_at", null).maybeSingle();
    if (existing) return { ok: true as const, id: existing.id, version: Number(existing.version), duplicate: true, driveArchived: existing.drive_sync_status === "SYNCED" };

    const documentId = crypto.randomUUID();
    const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    storagePath = `${projectId}/photo-strip-designs/${documentId}.${extension}`;
    const upload = await admin.storage.from("orbit-documents").upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const { data, error: registerError } = await client.rpc("register_photo_strip_design", {
      p_document_id: documentId,
      p_project_id: projectId,
      p_storage_path: storagePath,
      p_checksum: checksum,
      p_original_filename: file.name,
      p_mime_type: file.type,
      p_idempotency_key: idempotencyKey,
    });
    if (registerError) {
      await admin.storage.from("orbit-documents").remove([storagePath]);
      storagePath = "";
      throw registerError;
    }
    const persisted = Array.isArray(data) ? data[0] : data;
    const persistedId = String(persisted?.document_id ?? documentId);
    const version = Number(persisted?.document_version ?? 1);
    if (persistedId !== documentId) await admin.storage.from("orbit-documents").remove([storagePath]);
    storagePath = "";
    let driveArchived = false;
    let warning: string | undefined;
    try {
      await archivePhotoStripDesign({ admin, documentId: persistedId, bytes });
      driveArchived = true;
    } catch (driveError) {
      await recordPhotoStripDriveFailure(admin, persistedId, driveError);
      warning = "El diseño quedó protegido en ORBIT y visible en el Portal; el archivo de Drive está pendiente de reintento.";
      console.error("[ORBIT][PHOTO_STRIP_DRIVE_ARCHIVE]", driveError);
    }
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/events");
    return { ok: true as const, id: persistedId, version, duplicate: false, driveArchived, warning };
  } catch (error) {
    if (storagePath) await createAdminClient().storage.from("orbit-documents").remove([storagePath]);
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible guardar el diseño." };
  }
}

export async function approvePhotoStripDesignAction(projectId: string, documentId: string) {
  try {
    const { client } = await founderSession();
    await eligibleProject(projectId);
    const { error } = await client.rpc("approve_photo_strip_design", { p_document_id: documentId });
    if (error) throw error;
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, message: "Diseño aprobado." };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible aprobar el diseño." };
  }
}

export async function retryPhotoStripDriveAction(projectId: string, documentId: string) {
  try {
    await founderSession();
    const { admin } = await eligibleProject(projectId);
    const { data: document, error } = await admin.from("documents").select("id")
      .eq("id", documentId).eq("project_id", projectId).eq("document_type", PHOTO_STRIP_DESIGN_TYPE)
      .is("deleted_at", null).single();
    if (error || !document) throw new Error("Diseño no encontrado.");
    const result = await archivePhotoStripDesign({ admin, documentId });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, message: result.reused ? "Archivo de Drive reconciliado sin duplicados." : "Archivo guardado en Drive." };
  } catch (error) {
    try { await recordPhotoStripDriveFailure(createAdminClient(), documentId, error); } catch {}
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible reintentar Drive." };
  }
}

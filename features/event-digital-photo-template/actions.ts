"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { archiveEventDigitalPhotoTemplate, recordEventDigitalPhotoTemplateDriveFailure } from "./service";
import { EVENT_DIGITAL_PHOTO_TEMPLATE_TYPE } from "./model";

const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

async function founderSession() {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder o Administración puede gestionar el template.");
  return { client, user: data.user };
}

export async function uploadEventDigitalPhotoTemplateAction(formData: FormData) {
  let storagePath = "";
  try {
    const { client, user } = await founderSession();
    const projectId = String(formData.get("projectId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Selecciona el template digital.");
    if (file.size > 20 * 1024 * 1024 || !allowedMimeTypes.has(file.type)) throw new Error("Usa PDF, JPG, JPEG o PNG de hasta 20 MB.");
    const admin = createAdminClient();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const idempotencyKey = `event-digital-photo-template|${projectId}|${checksum}`;
    const { data: existing } = await admin.from("documents").select("id,version,drive_sync_status").eq("idempotency_key", idempotencyKey).eq("document_type", EVENT_DIGITAL_PHOTO_TEMPLATE_TYPE).is("deleted_at", null).maybeSingle();
    if (existing) return { ok: true as const, id: existing.id, version: Number(existing.version), duplicate: true, driveArchived: existing.drive_sync_status === "SYNCED" };
    const documentId = crypto.randomUUID();
    const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    storagePath = `${projectId}/event-digital-photo-templates/${documentId}.${extension}`;
    const upload = await admin.storage.from("orbit-documents").upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const { data, error } = await client.rpc("register_event_digital_photo_template", { p_document_id: documentId, p_project_id: projectId, p_storage_path: storagePath, p_checksum: checksum, p_original_filename: file.name, p_mime_type: file.type, p_file_size: file.size, p_idempotency_key: idempotencyKey, p_uploaded_by: user.id });
    if (error) { await admin.storage.from("orbit-documents").remove([storagePath]); storagePath = ""; throw error; }
    const persisted = Array.isArray(data) ? data[0] : data;
    const persistedId = String(persisted?.document_id ?? documentId);
    const version = Number(persisted?.document_version ?? 1);
    if (persistedId !== documentId) await admin.storage.from("orbit-documents").remove([storagePath]);
    storagePath = "";
    let driveArchived = false;
    let warning: string | undefined;
    try { await archiveEventDigitalPhotoTemplate({ admin, documentId: persistedId, bytes }); driveArchived = true; }
    catch (driveError) { await recordEventDigitalPhotoTemplateDriveFailure(admin, persistedId, driveError); warning = "El template quedó protegido en ORBIT; el respaldo de Drive está pendiente de reintento."; console.error("[ORBIT][EVENT_DIGITAL_TEMPLATE_DRIVE]", driveError); }
    revalidatePath(`/projects/${projectId}`); revalidatePath("/events");
    return { ok: true as const, id: persistedId, version, duplicate: false, driveArchived, warning };
  } catch (error) {
    if (storagePath) await createAdminClient().storage.from("orbit-documents").remove([storagePath]);
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible guardar el template." };
  }
}

export async function retryEventDigitalPhotoTemplateDriveAction(projectId: string, documentId: string) {
  try { await founderSession(); const admin = createAdminClient(); const { data } = await admin.from("documents").select("id").eq("id", documentId).eq("project_id", projectId).eq("document_type", EVENT_DIGITAL_PHOTO_TEMPLATE_TYPE).is("deleted_at", null).single(); if (!data) throw new Error("Template no encontrado."); const result = await archiveEventDigitalPhotoTemplate({ admin, documentId }); revalidatePath(`/projects/${projectId}`); return { ok: true as const, message: result.reused ? "Respaldo de Drive reconciliado sin duplicados." : "Template respaldado en Drive." }; }
  catch (error) { try { await recordEventDigitalPhotoTemplateDriveFailure(createAdminClient(), documentId, error); } catch {} return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible reintentar Drive." }; }
}

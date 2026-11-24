"use server";

import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { repairPendingDocumentBackups } from "../application/document-backup-repair.service";

export async function repairPendingDocumentBackupsAction(documentIds?: string[]) {
  const selectedIds = [...new Set((documentIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (!selectedIds.length) throw new Error("Selecciona explícitamente un ID de documento para reparar.");
  const sessionClient = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await sessionClient.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede reparar respaldos documentales.");
  return repairPendingDocumentBackups({ client: createAdminClient(), documentIds: selectedIds });
}

/** Reparación acotada y explícita desde la sesión administrativa, nunca desde cron. */
export async function repairAllPendingDocumentBackupsAction() {
  const sessionClient = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await sessionClient.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede ejecutar la recuperación.");

  const client = createAdminClient();
  const { data, error } = await client.from("documents")
    .select("id").is("deleted_at", null).is("drive_file_id", null)
    .in("document_type", ["PAYMENT_RECEIPT", "COMMERCIAL_DOCUMENT", "STAFF_EXPENSE_RECEIPT"])
    .order("id", { ascending: true }).limit(26);
  if (error) throw error;
  const ids = (data ?? []).map((item) => item.id);
  if (ids.length > 25) throw new Error("Hay más de 25 documentos pendientes: revisión por lotes necesaria.");
  if (!ids.length) return [];
  return repairPendingDocumentBackups({ client, documentIds: ids });
}

/**
 * Revisión excepcional de integridad: NO modifica nada hasta que el administrador
 * inspeccione el archivo original y confirme la corrección del checksum.
 */
const OSCAR_DOCUMENT_ID = "95b5aca1-9d7a-402e-9410-49525fcdbb8e";

async function requireDocumentRepairAdministrator() {
  const session = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await session.auth.getUser();
  if (authError || !auth.user) throw new Error("Sesión administrativa requerida.");
  const { data: profile, error: profileError } = await session.from("profiles")
    .select("role").eq("id", auth.user.id).single();
  if (profileError || !isAdministrativeRole(profile?.role)) throw new Error("Operación restringida a Administración.");
  return auth.user.id;
}

async function loadOscarSource() {
  const client = createAdminClient();
  const { data: document, error } = await client.from("documents")
    .select("id,document_type,project_id,storage_bucket,storage_path,checksum,file_size,mime_type,original_filename,drive_file_id,metadata")
    .eq("id", OSCAR_DOCUMENT_ID).is("deleted_at", null).single();
  if (error || !document) throw new Error("Comprobante original no disponible.");
  if (document.drive_file_id || document.document_type !== "PAYMENT_RECEIPT"
    || document.mime_type !== "image/png"
    || document.original_filename !== "Screenshot_20260917-155910.png"
    || document.storage_bucket !== "orbit-documents"
    || document.storage_path !== "a12e3aec-3cc8-49b1-8ed2-7d0a6dd4c8e8/44aa7ed9-a99e-4645-82db-2d1b0c3dd55a-Screenshot_20260917-155910.png") {
    throw new Error("La identidad documental cambió; no puede reconciliarse automáticamente.");
  }
  const { data, error: storageError } = await client.storage.from(document.storage_bucket).download(document.storage_path);
  if (storageError || !data) throw new Error("No se pudo descargar el original de Supabase Storage.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength !== document.file_size || bytes.byteLength !== 208403)
    throw new Error("Tamaño del original diferente: no se autoriza la reconciliación.");
  const { createHash } = await import("node:crypto");
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  const isPng = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  if (!isPng) throw new Error("El original no contiene una firma PNG válida.");
  return { client, document, actualSha256 };
}

export async function inspectOscarReceiptIntegrityAction() {
  await requireDocumentRepairAdministrator();
  const { client, document, actualSha256 } = await loadOscarSource();
  const { data, error } = await client.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 120);
  if (error || !data?.signedUrl) throw new Error("No se pudo generar vista previa temporal del archivo.");
  return {
    documentId: document.id,
    filename: document.original_filename,
    recordedSha256: document.checksum,
    actualSha256,
    size: document.file_size,
    previewUrl: data.signedUrl,
    expiresInSeconds: 120,
  };
}

export async function approveOscarReceiptIntegrityAction(approvedSha256: string) {
  const approvedBy = await requireDocumentRepairAdministrator();
  if (!/^[a-f0-9]{64}$/.test(approvedSha256)) throw new Error("Checksum aprobado inválido.");
  const { client, document, actualSha256 } = await loadOscarSource();
  if (actualSha256 !== approvedSha256)
    throw new Error("El contenido cambió desde la vista previa. Repite la inspección.");
  if (document.checksum !== actualSha256) {
    // Preservar el checksum anterior y la aprobación humana en el historial.
    const metadata = document.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata)
      ? document.metadata as Record<string, unknown> : {};
    const { data: updated, error } = await client.from("documents").update({
      checksum: actualSha256,
      metadata: {
        ...metadata,
        integrity_reconciliation: {
          previous_sha256: document.checksum,
          verified_sha256: actualSha256,
          verified_size: document.file_size,
          original_storage_path: document.storage_path,
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
          method: "ADMIN_VISUAL_REVIEW_OF_IMMUTABLE_ORIGINAL_STORAGE",
        },
      },
    }).eq("id", OSCAR_DOCUMENT_ID).eq("checksum", document.checksum).is("drive_file_id", null)
      .select("id").maybeSingle();
    if (error || !updated) throw new Error("El registro cambió durante la conciliación; no se sobrescribió.");
  }
  const result = await repairPendingDocumentBackups({ client, documentIds: [OSCAR_DOCUMENT_ID] });
  return result[0] ?? { documentId: OSCAR_DOCUMENT_ID, status: "REQUIRES_REVIEW" as const, reason: "La reparación no devolvió resultado." };
}

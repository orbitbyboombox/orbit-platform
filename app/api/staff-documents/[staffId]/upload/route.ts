import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffDocumentAdministrator } from "@/features/staff-documents/staff-document-auth";
import {
  isCanonicalMonth,
  isStaffDocumentCategory,
  staffDocumentCategoryMeta,
  staffDocumentStoragePath,
  staffDocumentType,
} from "@/features/staff-documents/staff-document-model";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const maxFileSize = 10_485_760;

const responseError = (message: string, status: number) =>
  NextResponse.json({ message }, { status });

async function requireStaff(staffId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ staffId: string }> },
) {
  const authorization = await requireStaffDocumentAdministrator();
  if (!authorization.ok)
    return responseError(authorization.message, authorization.status);
  try {
    const { staffId } = await params;
    if (!(await requireStaff(staffId)))
      return responseError("Colaborador no encontrado.", 404);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "AUTHORIZE");
    const categoryValue = String(body.category ?? "");
    const applicableMonth = String(body.applicableMonth ?? "").trim() || null;
    const fileName = String(body.fileName ?? "").trim();
    const mimeType = String(body.mimeType ?? "");
    const label = String(body.label ?? "").trim();
    if (!isStaffDocumentCategory(categoryValue))
      return responseError("La categoría documental no es válida.", 400);
    const category = categoryValue;
    const periodic = staffDocumentCategoryMeta.find(
      (item) => item.category === category,
    )?.periodic;
    if (periodic && !isCanonicalMonth(applicableMonth ?? ""))
      return responseError("Selecciona un mes válido para el documento.", 400);

    if (action === "AUTHORIZE") {
      const fileSize = Number(body.fileSize ?? 0);
      if (!fileName) return responseError("Selecciona un archivo.", 400);
      if (!allowedMimeTypes.has(mimeType))
        return responseError("El documento debe ser JPG, PNG, WEBP o PDF.", 400);
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxFileSize)
        return responseError(
          fileSize > maxFileSize
            ? "El archivo supera el máximo de 10 MB."
            : "El documento está vacío.",
          400,
        );
      const documentId = crypto.randomUUID();
      const path = staffDocumentStoragePath({
        staffId,
        category,
        applicableMonth,
        documentId,
        fileName,
      });
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("orbit-documents")
        .createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error("Storage no disponible.");
      return NextResponse.json({ documentId, path, signedUrl: data.signedUrl });
    }

    if (action !== "COMPLETE") return responseError("Acción inválida.", 400);
    const documentId = String(body.documentId ?? "");
    const path = String(body.path ?? "");
    const expectedPath = staffDocumentStoragePath({
      staffId,
      category,
      applicableMonth,
      documentId,
      fileName,
    });
    if (!documentId || path !== expectedPath)
      return responseError("La referencia del documento no es válida.", 400);
    const admin = createAdminClient();
    const { data: objectExists, error: storageError } = await admin.storage
      .from("orbit-documents")
      .exists(path);
    if (storageError || !objectExists)
      return responseError("La carga no terminó correctamente. Reintenta.", 409);
    const now = new Date().toISOString();
    const { data: document, error } = await admin
      .from("staff_onboarding_documents")
      .insert({
        id: documentId,
        invitation_id: null,
        staff_id: staffId,
        document_type: staffDocumentType(category),
        category,
        applicable_month: periodic ? applicableMonth : null,
        friendly_label: label || fileName,
        storage_bucket: "orbit-documents",
        storage_path: path,
        file_name: fileName,
        mime_type: mimeType,
        status: "ACTIVE",
        created_by: authorization.userId,
        updated_at: now,
      })
      .select(
        "id,category,document_type,file_name,friendly_label,created_at,applicable_month,status",
      )
      .single();
    if (error) {
      await admin.storage.from("orbit-documents").remove([path]);
      throw error;
    }
    return NextResponse.json({
      document: {
        id: document.id,
        category: document.category,
        documentType: document.document_type,
        fileName: document.file_name,
        label: document.friendly_label || document.file_name,
        createdAt: document.created_at,
        applicableMonth: document.applicable_month,
        status: document.status,
        source: "STAFF_DOCUMENT",
      },
    });
  } catch (error) {
    console.error("staff_document.upload_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return responseError("No fue posible guardar el documento.", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ staffId: string }> },
) {
  const authorization = await requireStaffDocumentAdministrator();
  if (!authorization.ok)
    return responseError(authorization.message, authorization.status);
  try {
    const { staffId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const path = String(body.path ?? "");
    if (!path.startsWith(`staff/${staffId}/`))
      return responseError("La referencia del documento no es válida.", 400);
    const admin = createAdminClient();
    const { data: metadata } = await admin
      .from("staff_onboarding_documents")
      .select("id")
      .eq("staff_id", staffId)
      .eq("storage_path", path)
      .maybeSingle();
    if (!metadata) await admin.storage.from("orbit-documents").remove([path]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

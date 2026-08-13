import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffOnboardingTokenHash } from "@/features/staff-onboarding/staff-onboarding.service";
import { requireValidChileanRut } from "@/lib/chile/rut";

const documentTypes = new Set([
  "IDENTITY_FRONT",
  "IDENTITY_BACK",
  "DRIVER_LICENSE_FRONT",
  "DRIVER_LICENSE_BACK",
]);
type UploadedDocument = {
  documentType: string;
  path: string;
  fileName: string;
  mimeType: string;
};
const publicMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  return /coerce|json object|pgrst|schema|constraint|violates|column/i.test(message)
    ? "No fue posible guardar la solicitud. Tus datos siguen disponibles para reintentar."
    : message || "No fue posible enviar el registro.";
};

export async function POST(request: Request) {
  const newPaths: string[] = [];
  let invitationId = "";
  let documentsPersisted = false;
  let previousDocuments: Array<Record<string, unknown>> = [];
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token ?? "");
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    const uploadedDocuments = Array.isArray(body.documents)
      ? (body.documents as UploadedDocument[])
      : [];
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: invitation, error } = await admin
      .from("staff_onboarding_invitations")
      .select("id,email,status")
      .eq("token_hash", staffOnboardingTokenHash(token))
      .gt("expires_at", now)
      .in("status", ["INVITED", "OPENED", "CHANGES_REQUESTED"])
      .maybeSingle();
    if (error) throw error;
    if (!invitation)
      return NextResponse.json(
        { message: "La invitación ya no está disponible." },
        { status: 404 },
      );
    invitationId = invitation.id;
    const required = [
      "rut",
      "birthDate",
      "address",
      "district",
      "city",
      "phone",
      "emergencyName",
      "emergencyPhone",
      "bank",
      "accountType",
      "accountNumber",
      "accountHolder",
    ];
    if (
      required.some((key) => !String(payload[key] ?? "").trim()) ||
      !Array.isArray(payload.capabilities) ||
      payload.capabilities.length === 0
    )
      return NextResponse.json(
        { message: "Completa toda la información solicitada." },
        { status: 400 },
      );
    payload.rut = requireValidChileanRut(String(payload.rut));
    const requiresLicense =
      Boolean(payload.canDrive) ||
      (payload.capabilities as string[]).some(
        (item) => item === "ASSEMBLY" || item === "DISASSEMBLY",
      );
    const requiredDocumentTypes = ["IDENTITY_FRONT", "IDENTITY_BACK"];
    if (requiresLicense)
      requiredDocumentTypes.push("DRIVER_LICENSE_FRONT", "DRIVER_LICENSE_BACK");
    const prefix = `staff-onboarding/${invitation.id}/`;
    const documents = uploadedDocuments.filter(
      (document) =>
        documentTypes.has(document.documentType) &&
        document.path.startsWith(prefix),
    );
    const uniqueDocumentTypes = new Set(
      documents.map((document) => document.documentType),
    );
    if (
      documents.length !== uploadedDocuments.length ||
      uniqueDocumentTypes.size !== documents.length ||
      requiredDocumentTypes.some(
        (type) => !documents.some((document) => document.documentType === type),
      )
    )
      throw new Error("Faltan documentos requeridos para enviar el registro.");

    for (const document of documents) {
      const { data: exists, error: storageError } = await admin.storage
        .from("orbit-documents")
        .exists(document.path);
      if (storageError || !exists)
        throw storageError ?? new Error(`No se cargó ${document.fileName}.`);
      newPaths.push(document.path);
    }

    const { data: storedDocuments, error: previousError } = await admin
      .from("staff_onboarding_documents")
      .select(
        "invitation_id,staff_id,document_type,storage_bucket,storage_path,file_name,mime_type,created_at",
      )
      .eq("invitation_id", invitation.id);
    if (previousError) throw previousError;
    previousDocuments = storedDocuments ?? [];
    const rows = documents.map((document) => ({
      invitation_id: invitation.id,
      document_type: document.documentType,
      storage_path: document.path,
      file_name: document.fileName,
      mime_type: document.mimeType,
    }));
    const { error: documentError } = await admin
      .from("staff_onboarding_documents")
      .upsert(rows, { onConflict: "invitation_id,document_type" });
    if (documentError) throw documentError;
    documentsPersisted = true;
    const { error: updateError } = await admin
      .from("staff_onboarding_invitations")
      .update({
        status: "SUBMITTED",
        submitted_data: payload,
        submitted_at: now,
        review_notes: null,
        updated_at: now,
      })
      .eq("id", invitation.id);
    if (updateError) throw updateError;
    const replacedPaths = (previousDocuments ?? [])
      .filter((previous) =>
        documents.some(
          (document) =>
            document.documentType === previous.document_type &&
            document.path !== previous.storage_path,
        ),
      )
      .map((previous) => String(previous.storage_path));
    if (replacedPaths.length)
      await admin.storage.from("orbit-documents").remove(replacedPaths);
    console.info("staff_onboarding.submitted", {
      invitationId: invitation.id,
      documentCount: documents.length,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (documentsPersisted && invitationId) {
      const admin = createAdminClient();
      const { error: rollbackDeleteError } = await admin
        .from("staff_onboarding_documents")
        .delete()
        .eq("invitation_id", invitationId);
      const { error: rollbackInsertError } = previousDocuments.length
        ? await admin.from("staff_onboarding_documents").insert(previousDocuments)
        : { error: null };
      if (rollbackDeleteError || rollbackInsertError)
        console.error("staff_onboarding.document_rollback_failed", {
          invitationId,
          rollbackDeleteError,
          rollbackInsertError,
        });
    }
    if (newPaths.length) {
      const admin = createAdminClient();
      await admin.storage.from("orbit-documents").remove(newPaths);
    }
    console.error("staff_onboarding.submission_failed", error);
    return NextResponse.json(
      {
        message: publicMessage(error),
      },
      { status: 400 },
    );
  }
}

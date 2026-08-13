import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffOnboardingTokenHash } from "@/features/staff-onboarding/staff-onboarding.service";

const allowedTypes = new Set([
  "IDENTITY_FRONT",
  "IDENTITY_BACK",
  "DRIVER_LICENSE_FRONT",
  "DRIVER_LICENSE_BACK",
]);
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const maxFileSize = 10_485_760;
const publicMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  return /coerce|json object|pgrst|schema|constraint|violates|column/i.test(message)
    ? "No fue posible iniciar la carga. Inténtalo nuevamente."
    : message || "No fue posible iniciar la carga del documento.";
};

async function findInvitation(token: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff_onboarding_invitations")
    .select("id")
    .eq("token_hash", staffOnboardingTokenHash(token))
    .gt("expires_at", new Date().toISOString())
    .in("status", ["INVITED", "OPENED", "CHANGES_REQUESTED"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token ?? "");
    const documentType = String(body.documentType ?? "");
    const fileName = String(body.fileName ?? "");
    const mimeType = String(body.mimeType ?? "");
    const fileSize = Number(body.fileSize ?? 0);
    if (!allowedTypes.has(documentType))
      throw new Error("El tipo de documento no es válido.");
    if (!allowedMimeTypes.has(mimeType))
      throw new Error("Los documentos deben ser JPG, PNG, WEBP o PDF.");
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxFileSize)
      throw new Error(
        fileSize > maxFileSize
          ? `${fileName || "El archivo"} supera 10 MB.`
          : "El documento está vacío.",
      );
    const invitation = await findInvitation(token);
    if (!invitation)
      return NextResponse.json(
        { message: "La invitación ya no está disponible." },
        { status: 404 },
      );
    const extension = fileName.split(".").pop()?.toLowerCase() || "bin";
    const path = `staff-onboarding/${invitation.id}/${documentType.toLowerCase()}-${crypto.randomUUID()}.${extension}`;
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from("orbit-documents")
      .createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error("No se pudo iniciar la carga.");
    console.info("staff_onboarding.upload_authorized", {
      invitationId: invitation.id,
      documentType,
      fileSize,
    });
    return NextResponse.json({
      path,
      signedUrl: data.signedUrl,
      uploadToken: data.token,
    });
  } catch (error) {
    console.error("staff_onboarding.upload_authorization_failed", error);
    return NextResponse.json(
      {
        message: publicMessage(error),
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token ?? "");
    const invitation = await findInvitation(token);
    if (!invitation) return NextResponse.json({ ok: true });
    const prefix = `staff-onboarding/${invitation.id}/`;
    const paths = Array.isArray(body.paths)
      ? body.paths.map(String).filter((path) => path.startsWith(prefix))
      : [];
    if (paths.length) {
      const admin = createAdminClient();
      const { error } = await admin.storage.from("orbit-documents").remove(paths);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("staff_onboarding.upload_cleanup_failed", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

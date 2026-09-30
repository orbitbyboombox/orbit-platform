"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadTaxDocumentDeliveryComposer,
  sendTaxDocumentDelivery,
} from "@/features/connectors/google-gmail/application/tax-document-delivery.service";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "No fue posible completar la operación.";

async function requireTaxDocumentSender() {
  const client = await createSupabaseServerClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) {
    throw new Error("Solo Founder o Administración puede enviar documentos tributarios.");
  }
  return auth.user.id;
}

export async function getTaxDocumentDeliveryPreviewAction(
  projectId: string,
  documentId: string,
) {
  try {
    await requireTaxDocumentSender();
    return {
      ok: true as const,
      preview: await loadTaxDocumentDeliveryComposer(projectId, documentId),
    };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}

export async function sendTaxDocumentDeliveryAction(formData: FormData) {
  try {
    const actorId = await requireTaxDocumentSender();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const documentId = String(formData.get("documentId") ?? "").trim();
    const requestId = String(formData.get("requestId") ?? "").trim();
    if (!projectId || !documentId || !requestId) {
      throw new Error("El intento de envío no es válido.");
    }
    const result = await sendTaxDocumentDelivery({
      projectId,
      documentId,
      actorId,
      requestId,
      expectedFingerprint: String(formData.get("expectedFingerprint") ?? ""),
      to: String(formData.get("to") ?? ""),
      cc: String(formData.get("cc") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      confirmResend: formData.get("confirmResend") === "true",
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/customers");
    return {
      ok: true as const,
      result,
      message:
        result.status === "SENT"
          ? "✓ Documento tributario enviado correctamente"
          : "El envío quedó registrado.",
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "tax_document_delivery.send_failed",
        projectId: String(formData.get("projectId") ?? ""),
        documentId: String(formData.get("documentId") ?? ""),
        error: message(error),
      }),
    );
    return { ok: false as const, error: message(error) };
  }
}

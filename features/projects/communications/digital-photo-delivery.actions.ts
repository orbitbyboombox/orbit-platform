"use server";

import { revalidatePath } from "next/cache";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadDigitalPhotoDeliveryComposer,
  saveDigitalPhotoDeliveryUrl,
  sendDigitalPhotoDelivery,
} from "@/features/connectors/google-gmail/application/digital-photo-delivery.service";

async function requireDigitalPhotoDeliveryFounder() {
  const client = await createSupabaseServerClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile.role))
    throw new Error("Solo Founder o Administración puede enviar fotos digitales.");
  return auth.user.id;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : "No fue posible completar la operación.";

export async function getDigitalPhotoDeliveryPreviewAction(projectId: string) {
  try {
    await requireDigitalPhotoDeliveryFounder();
    return {
      ok: true as const,
      preview: await loadDigitalPhotoDeliveryComposer(projectId),
    };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}

export async function saveDigitalPhotoDeliveryPreviewAction(formData: FormData) {
  try {
    const actorId = await requireDigitalPhotoDeliveryFounder();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const photoUrl = String(formData.get("photoUrl") ?? "").trim();
    if (!projectId) throw new Error("El Evento no es válido.");
    const preview = await saveDigitalPhotoDeliveryUrl({ projectId, actorId, photoUrl });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, preview };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}

export async function sendDigitalPhotoDeliveryAction(formData: FormData) {
  try {
    const actorId = await requireDigitalPhotoDeliveryFounder();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const requestId = String(formData.get("requestId") ?? "").trim();
    if (!projectId || !requestId) throw new Error("El intento de envío no es válido.");
    const result = await sendDigitalPhotoDelivery({
      projectId,
      actorId,
      requestId,
      photoUrl: String(formData.get("photoUrl") ?? ""),
      cc: String(formData.get("cc") ?? ""),
      confirmResend: formData.get("confirmResend") === "true",
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/customers`);
    if (result.status === "FAILED") {
      return {
        ok: false as const,
        result,
        error: "No fue posible enviar las fotos digitales.",
      };
    }
    if (result.status === "PENDING") {
      return {
        ok: true as const,
        result,
        message: "El proveedor confirmó el envío. El historial está sincronizando.",
      };
    }
    return {
      ok: true as const,
      result,
      message: "✓ Fotos digitales enviadas correctamente",
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "digital_photo_delivery.send_failed",
        projectId: String(formData.get("projectId") ?? ""),
        error: message(error),
      }),
    );
    return {
      ok: false as const,
      error: "No fue posible enviar las fotos digitales.",
    };
  }
}

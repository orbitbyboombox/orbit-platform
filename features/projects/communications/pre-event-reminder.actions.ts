"use server";

import { revalidatePath } from "next/cache";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadPreEventReminderComposer,
  sendPreEventReminder,
} from "@/features/connectors/google-gmail/application/pre-event-reminder.service";

async function requirePreEventReminderFounder() {
  const client = await createSupabaseServerClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile.role)) {
    throw new Error(
      "Solo Founder o Administración puede enviar recordatorios pre-evento.",
    );
  }
  return auth.user.id;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : "No fue posible completar la operación.";

export async function getPreEventReminderPreviewAction(projectId: string) {
  try {
    await requirePreEventReminderFounder();
    return {
      ok: true as const,
      preview: await loadPreEventReminderComposer(projectId),
    };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}

export async function sendPreEventReminderAction(formData: FormData) {
  try {
    const actorId = await requirePreEventReminderFounder();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const requestId = String(formData.get("requestId") ?? "").trim();
    if (!projectId || !requestId) throw new Error("El intento de envío no es válido.");
    const result = await sendPreEventReminder({
      projectId,
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
    if (result.status === "FAILED") {
      return {
        ok: false as const,
        result,
        error: "Este intento ya falló y no se reenviará automáticamente. Abre un nuevo intento.",
      };
    }
    return {
      ok: true as const,
      result,
      message:
        result.status === "PENDING"
          ? "El proveedor confirmó el envío. El historial está sincronizando."
          : "✓ Recordatorio pre-evento enviado correctamente",
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "pre_event_reminder.send_failed",
        projectId: String(formData.get("projectId") ?? ""),
        error: message(error),
      }),
    );
    return { ok: false as const, error: message(error) };
  }
}

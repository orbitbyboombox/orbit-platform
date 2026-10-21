"use server";

import { revalidatePath } from "next/cache";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadBbox360VideoDeliveryComposer, saveBbox360VideoDeliveryUrl, sendBbox360VideoDelivery } from "@/features/connectors/google-gmail/application/bbox360-video-delivery.service";

async function requireFounder() {
  const client = await createSupabaseServerClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile.role)) throw new Error("Solo Founder o Administración puede enviar videos BBOX 360.");
  return auth.user.id;
}
const message = (error: unknown) => error instanceof Error ? error.message : "No fue posible completar la operación.";

export async function getBbox360VideoDeliveryPreviewAction(projectId: string) { try { await requireFounder(); return { ok: true as const, preview: await loadBbox360VideoDeliveryComposer(projectId) }; } catch (error) { return { ok: false as const, error: message(error) }; } }
export async function saveBbox360VideoDeliveryPreviewAction(formData: FormData) { try { const actorId = await requireFounder(); const projectId = String(formData.get("projectId") ?? "").trim(); if (!projectId) throw new Error("El Evento no es válido."); const preview = await saveBbox360VideoDeliveryUrl({ projectId, actorId, videoUrl: String(formData.get("videoUrl") ?? "") }); revalidatePath(`/projects/${projectId}`); return { ok: true as const, preview }; } catch (error) { return { ok: false as const, error: message(error) }; } }
export async function sendBbox360VideoDeliveryAction(formData: FormData) { try { const actorId = await requireFounder(); const projectId = String(formData.get("projectId") ?? "").trim(); const requestId = String(formData.get("requestId") ?? "").trim(); if (!projectId || !requestId) throw new Error("El intento de envío no es válido."); const result = await sendBbox360VideoDelivery({ projectId, actorId, requestId, videoUrl: String(formData.get("videoUrl") ?? ""), cc: String(formData.get("cc") ?? ""), confirmResend: formData.get("confirmResend") === "true" }); revalidatePath(`/projects/${projectId}`); return result.status === "FAILED" ? { ok: false as const, result, error: "No fue posible enviar los videos BBOX 360." } : { ok: true as const, result, message: result.status === "PENDING" ? "El proveedor confirmó el envío. El historial está sincronizando." : "✓ Videos BBOX 360 enviados correctamente" }; } catch (error) { console.error(JSON.stringify({ level: "error", event: "bbox360_video_delivery.send_failed", projectId: String(formData.get("projectId") ?? ""), error: message(error) })); return { ok: false as const, error: "No fue posible enviar los videos BBOX 360." }; } }

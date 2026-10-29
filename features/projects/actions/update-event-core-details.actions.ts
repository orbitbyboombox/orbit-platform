"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { propagateCanonicalEventChange } from "@/features/projects/operations/canonical-event-propagation.service";

export async function loadEventCoreDetailsAction(projectId: string): Promise<{ version: number; eventDate: string; eventTime: string; location: string; city: string }> {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Debes iniciar sesión.");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError || !profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Acceso reservado a Administración.");
  const { data, error } = await client.from("projects").select("version,event_date,event_time,location,city").eq("id", projectId).is("deleted_at", null).single();
  if (error || !data) throw error ?? new Error("Evento no encontrado.");
  return { version: data.version, eventDate: data.event_date ?? "", eventTime: data.event_time ?? "", location: data.location ?? "", city: data.city ?? "" };
}

export async function updateEventCoreDetailsAction(input: {
  projectId: string;
  expectedVersion: number;
  eventDate: string;
  eventTime: string;
  location: string;
  city: string;
  reason: string;
}): Promise<{ ok: boolean; message: string; version?: number }> {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Debes iniciar sesión.");
    const { data: allowed, error: permissionError } = await client.rpc("can_administer");
    if (permissionError || allowed !== true) throw new Error("Solo Administración puede modificar eventos.");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(input.eventDate) || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(input.eventTime) ||
      !input.location.trim() || !input.city.trim() || input.reason.trim().length < 3 ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
      throw new Error("Fecha, hora, ubicación, comuna, versión y motivo son obligatorios.");
    const { data: before, error: readError } = await client.from("projects")
      .select("id,customer_id,event_date,event_time,location,city,version")
      .eq("id", input.projectId).single();
    if (readError || !before) throw readError ?? new Error("Evento no encontrado.");
    if (before.version !== input.expectedVersion) throw new Error("El evento cambió desde que abriste el editor. Actualiza la página.");
    const { data: updated, error: writeError } = await client.from("projects").update({
      event_date: input.eventDate, event_time: input.eventTime,
      location: input.location.trim(), city: input.city.trim(),
      version: input.expectedVersion + 1, updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }).eq("id", input.projectId).eq("version", input.expectedVersion)
      .select("id,version").maybeSingle();
    if (writeError) throw writeError;
    if (!updated) throw new Error("Otro usuario modificó este evento. Recarga antes de guardar.");
    const { error: auditError } = await client.from("timeline_events").insert({
      customer_id: before.customer_id, project_id: input.projectId,
      event_type: "EVENT_DETAILS_REVISED", title: "Datos del evento actualizados",
      description: JSON.stringify({ before: { eventDate: before.event_date, eventTime: before.event_time, location: before.location, city: before.city }, after: { eventDate: input.eventDate, eventTime: input.eventTime, location: input.location.trim(), city: input.city.trim() }, reason: input.reason.trim() }),
      actor_id: auth.user.id, actor_label: "Administrador", source: "Administrator",
      action: "EVENT_DETAILS_REVISED", entity_type: "Project", entity_id: input.projectId,
      human_message: "Se modificaron los datos operacionales del evento.", created_by: auth.user.id,
    });
    if (auditError) return { ok: false, message: "Evento actualizado, pero falló la auditoría. No repitas el guardado; contacta soporte.", version: updated.version };
    const calendar = await propagateCanonicalEventChange({ client, projectId: input.projectId, actorId: auth.user.id });
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/operations");
    revalidatePath("/staff-portal");
    return { ok: true, version: updated.version, message: calendar.status === "SYNCHRONIZED" ? "Evento actualizado y calendario sincronizado." : "Evento actualizado. Calendario pendiente de sincronización: " + calendar.status };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo actualizar el evento." };
  }
}

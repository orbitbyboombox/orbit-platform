"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { ok: true; routeId: string; message: string } | { ok: false; error: string };
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const ids = (data: FormData) => data.getAll("eventIds").map(String).filter(Boolean);
async function admin() {
  const client = await createSupabaseServerClient();
  const { data: user, error } = await client.auth.getUser();
  if (error || !user.user) throw new Error("Tu sesión no está disponible.");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", user.user.id).single();
  if (profileError || !profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Administración puede gestionar rutas.");
  return client;
}
function friendly(error: unknown) {
  const detail = error as { code?: string; message?: string; details?: string; hint?: string };
  console.error("[logistics-route-save]", {
    code: detail?.code ?? "UNKNOWN",
    message: detail?.message ?? (error instanceof Error ? error.message : "Unknown error"),
    details: detail?.details ?? null,
    hint: detail?.hint ?? null,
  });
  return "No fue posible guardar la ruta. Revisa la fecha, el tipo de ruta y los eventos seleccionados.";
}

const canonicalRouteType = (value: string) => {
  if (value === "MONTAGE" || value === "MONTAJE") return "ASSEMBLY";
  if (value === "DESMONTAJE") return "DISASSEMBLY";
  return value;
};

export async function saveLogisticsRoutePlanAction(data: FormData): Promise<Result> {
  try {
    const client = await admin();
    const projectIds = ids(data);
    if (!projectIds.length) throw new Error("Selecciona al menos un Evento válido.");
    const { data: projects, error: projectsError } = await client
      .from("projects")
      .select("id")
      .in("id", projectIds)
      .is("deleted_at", null);
    if (projectsError) throw projectsError;
    const existingProjectIds = new Set((projects ?? []).map((project) => project.id));
    const invalidProjectId = projectIds.find((projectId) => !existingProjectIds.has(projectId));
    if (invalidProjectId) throw new Error("Uno de los Eventos seleccionados ya no existe.");
    const { data: routeId, error } = await client.rpc("save_logistics_route_plan", {
      p_route_id: text(data, "routeId") || null,
      p_asset_id: text(data, "vehicleId") || null,
      p_route_date: text(data, "date"),
      p_driver_staff_id: text(data, "driverId") || null,
      p_route_type: canonicalRouteType(text(data, "routeType")),
      p_project_ids: projectIds,
    });
    if (error) throw error;
    const staffIds = data.getAll("staffIds").map(String).filter(Boolean);
    const { error: staffError } = await client.rpc("set_logistics_route_staff", { p_route_id: String(routeId), p_staff_ids: staffIds });
    if (staffError) throw staffError;
    revalidatePath("/staff");
    return { ok: true, routeId: String(routeId), message: "Ruta guardada como propuesta revisable." };
  } catch (error) { return { ok: false, error: friendly(error) }; }
}

export async function assignLogisticsRouteStaffAction(routeId: string, staffIds: string[]): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const client = await admin();
    const { error } = await client.rpc("set_logistics_route_staff", { p_route_id: routeId, p_staff_ids: staffIds });
    if (error) throw error;
    revalidatePath("/staff");
    return { ok: true, message: "Equipo de ruta actualizado." };
  } catch (error) { return { ok: false, error: friendly(error) }; }
}

export async function reorderLogisticsRouteAction(routeId: string, eventIds: string[]): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const client = await admin();
    const { error } = await client.rpc("reorder_logistics_route", { p_route_id: routeId, p_project_ids: eventIds });
    if (error) throw error;
    revalidatePath("/staff");
    return { ok: true, message: "Orden oficial guardado." };
  } catch (error) { return { ok: false, error: friendly(error) }; }
}

export async function publishLogisticsRouteAction(routeId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const client = await admin();
    const { data: version, error } = await client.rpc("publish_logistics_route", { p_route_id: routeId });
    if (error) throw error;
    revalidatePath("/staff");
    return { ok: true, message: `Ruta publicada para Staff · versión ${version}.` };
  } catch (error) { return { ok: false, error: friendly(error) }; }
}

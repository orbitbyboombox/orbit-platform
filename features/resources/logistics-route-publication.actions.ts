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
function friendly(error: unknown) { return error instanceof Error ? error.message : "No fue posible guardar la ruta."; }

export async function saveLogisticsRoutePlanAction(data: FormData): Promise<Result> {
  try {
    const client = await admin();
    const { data: routeId, error } = await client.rpc("save_logistics_route_plan", {
      p_route_id: text(data, "routeId") || null,
      p_asset_id: text(data, "vehicleId"),
      p_route_date: text(data, "date"),
      p_driver_staff_id: text(data, "driverId") || null,
      p_route_type: text(data, "routeType"),
      p_project_ids: ids(data),
    });
    if (error) throw error;
    revalidatePath("/staff");
    return { ok: true, routeId: String(routeId), message: "Ruta guardada como propuesta revisable." };
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

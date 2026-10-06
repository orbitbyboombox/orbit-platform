"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MASTER_CODES = Array.from({ length: 9 }, (_, index) => `CASE-${String(index + 1).padStart(2, "0")}`);
type Result = { ok: true } | { ok: false; error: string };

const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" && error.message) return error.message;
  return fallback;
};

async function adminClient() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", data.user.id).single();
  if (profileError) throw profileError;
  if (!(profile.role === "CEO" || profile.role === "ADMINISTRATOR")) throw new Error("Solo Master Admin puede gestionar la Caja Negra del Evento.");
  return client;
}

export async function loadEventBlackBoxOperationsAction(projectId: string) {
  try {
    const client = await adminClient();
    const [{ data: assignments, error: assignmentError }, { data: assets, error: assetError }, { data: availability, error: availabilityError }] = await Promise.all([
      client.from("asset_assignments").select("id,asset_id,assignment_status,assigned_at,assigned_by,operational_assets!inner(id,asset_code,status,asset_type)").eq("project_id", projectId).eq("assignment_status", "ASSIGNED").is("deleted_at", null).eq("operational_assets.asset_type", "CASE").in("operational_assets.asset_code", MASTER_CODES).limit(1),
      client.from("operational_assets").select("id,asset_code,status,metadata").eq("asset_type", "CASE").in("asset_code", MASTER_CODES).is("deleted_at", null).order("asset_code"),
      client.rpc("get_black_box_availability", { p_project_ids: [projectId] }),
    ]);
    if (assignmentError) throw assignmentError;
    if (assetError) throw assetError;
    if (availabilityError) throw availabilityError;
    const assignment = assignments?.[0] ?? null;
    const { data: snapshots, error: snapshotError } = assignment
      ? await client.from("event_paper_snapshots").select("id,asset_assignment_id,black_box_asset_code,black_box_name,black_box_initial_photo_stock,black_box_paper_format,black_box_assigned_at,black_box_assigned_by").eq("asset_assignment_id", assignment.id).limit(1)
      : { data: [], error: null };
    if (snapshotError) throw snapshotError;
    const availabilityByAsset = new Map((availability ?? []).map((item: { asset_id: string; conflicts: boolean }) => [item.asset_id, item.conflicts]));
    return { ok: true as const, assignment, snapshot: snapshots?.[0] ?? null, assets: (assets ?? []).map((asset) => ({ ...asset, conflicts: Boolean(availabilityByAsset.get(asset.id)) })), };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "No fue posible cargar la Caja Negra del Evento." };
  }
}

export async function assignBlackBoxToEventAction(input: { projectId: string; assetId: string; reason: string }): Promise<Result> {
  try {
    const client = await adminClient();
    const { data, error } = await client.rpc("assign_black_box_to_event", { p_project_id: input.projectId, p_asset_id: input.assetId, p_reason: input.reason });
    if (error) throw error;
    if (!data || typeof data !== "object" || !("assignmentId" in data)) throw new Error("La Caja Negra no devolvió una asignación confirmada.");
    try {
      revalidatePath(`/projects/${input.projectId}`);
      revalidatePath("/resources/staff");
    } catch (revalidationError) {
      console.error("[black-box] assignment committed but revalidation failed", revalidationError);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "No fue posible asignar la Caja Negra.") };
  }
}

export async function getBlackBoxAvailabilityForEventAction(projectId: string) {
  try {
    const result = await loadEventBlackBoxOperationsAction(projectId);
    if (!result.ok) return { ok: false as const, error: result.message };
    return { ok: true as const, assets: result.assets, assignment: result.assignment };
  } catch (error) {
    return { ok: false as const, error: errorMessage(error, "No fue posible consultar la disponibilidad.") };
  }
}

export async function removeBlackBoxFromEventAction(input: { projectId: string; reason: string }): Promise<Result> {
  try {
    const client = await adminClient();
    const { error } = await client.rpc("remove_black_box_from_event", { p_project_id: input.projectId, p_reason: input.reason });
    if (error) throw error;
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/resources/staff");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "No fue posible quitar la Caja Negra.") };
  }
}

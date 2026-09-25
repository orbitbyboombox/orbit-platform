"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loadEventBoxOperationsAction(projectId: string) {
  const client = await createSupabaseServerClient();
  const { data: assignments, error } = await client.from("asset_assignments").select("id,asset_id,assignment_status,return_condition,return_notes,planned_start_at,planned_end_at,operational_assets!inner(asset_code,status,asset_type)").eq("project_id", projectId).is("deleted_at", null).eq("operational_assets.asset_type", "BOX");
  if (error) return { ok: false as const, message: error.message };
  const ids = (assignments ?? []).map((item) => item.id);
  if (!ids.length) return { ok: true as const, assignments: [] };
  const [inspections, movements, incidents] = await Promise.all([
    client.from("asset_assignment_inspections").select("id,asset_assignment_id,inspection_type,inspection_status,notes,incident_flag,inspected_at").in("asset_assignment_id", ids).order("inspected_at", { ascending: false }),
    client.from("inventory_movements").select("id,project_id,orbit_event_id,movement_type,quantity_before,quantity_delta,quantity_after,occurred_at,reason").eq("project_id", projectId).eq("movement_type", "EVENT_USAGE").order("occurred_at", { ascending: false }),
    client.from("event_incidents").select("id,asset_assignment_id,incident_type,severity,status,description,created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
  ]);
  const firstError = inspections.error ?? movements.error ?? incidents.error;
  if (firstError) return { ok: false as const, message: firstError.message };
  return { ok: true as const, assignments: (assignments ?? []).map((item) => ({ ...item, box: Array.isArray(item.operational_assets) ? item.operational_assets[0] : item.operational_assets, inspections: (inspections.data ?? []).filter((row) => row.asset_assignment_id === item.id), movements: movements.data ?? [], incidents: (incidents.data ?? []).filter((row) => row.asset_assignment_id === item.id) })) };
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type BoxAsset = {
  id: string;
  asset_code: string;
  asset_type: string;
  status: string;
  metadata: Record<string, unknown>;
  notes: string | null;
  storage_location: string | null;
};

export async function loadBoxes(client: SupabaseClient) {
  const { data: boxes, error } = await client
    .from("operational_assets")
    .select("id,asset_code,asset_type,status,metadata,notes,storage_location")
    .eq("asset_type", "BOX")
    .is("deleted_at", null)
    .order("asset_code");
  if (error) throw error;
  const ids = (boxes ?? []).map((box) => box.id);
  const { data: children, error: childrenError } = ids.length
    ? await client.from("operational_assets").select("id,parent_asset_id,asset_type,status").in("parent_asset_id", ids).is("deleted_at", null)
    : { data: [], error: null };
  if (childrenError) throw childrenError;
  const childrenByBox = new Map<string, number>();
  for (const child of children ?? []) childrenByBox.set(child.parent_asset_id, (childrenByBox.get(child.parent_asset_id) ?? 0) + 1);
  return (boxes ?? []).map((box) => ({ ...box, childCount: childrenByBox.get(box.id) ?? 0 })) as (BoxAsset & { childCount: number })[];
}

export async function loadBoxDetail(client: SupabaseClient, assetId: string) {
  const { data: box, error } = await client
    .from("operational_assets")
    .select("id,asset_code,asset_type,status,metadata,notes,storage_location")
    .eq("id", assetId)
    .eq("asset_type", "BOX")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!box) return null;
  const [children, assignments] = await Promise.all([
    client.from("operational_assets").select("id,asset_code,asset_type,status,metadata,serial_number,notes").eq("parent_asset_id", assetId).is("deleted_at", null).order("asset_code"),
    client.from("asset_assignments").select("id,project_id,assignment_status,planned_start_at,planned_end_at,projects(name,event_date,event_time)").eq("asset_id", assetId).is("deleted_at", null).order("planned_start_at", { ascending: false }),
  ]);
  if (children.error) throw children.error;
  if (assignments.error) throw assignments.error;
  const assignmentIds = (assignments.data ?? []).map((assignment) => assignment.id);
  const inspections = assignmentIds.length
    ? await client.from("asset_assignment_inspections").select("id,asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,evidence_ref,inspected_at").in("asset_assignment_id", assignmentIds).order("inspected_at", { ascending: false })
    : { data: [], error: null };
  if (inspections.error) throw inspections.error;
  return { box, children: children.data ?? [], assignments: assignments.data ?? [], inspections: inspections.data ?? [] };
}

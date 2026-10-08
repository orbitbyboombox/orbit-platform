import type { SupabaseClient } from "@supabase/supabase-js";

export type BoxAsset = {
  id: string;
  asset_code: string;
  asset_type: string;
  status: string;
  metadata: Record<string, unknown>;
  version: number;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
  notes: string | null;
  storage_location: string | null;
  assignments: BoxEventAssignment[];
};

export type BoxEventAssignment = {
  id: string;
  projectId: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
};

export const MASTER_BLACK_BOX_CODES = Array.from({ length: 9 }, (_, index) => `CASE-${String(index + 1).padStart(2, "0")}`);

export const BLACK_BOX_PAPER_FORMATS = [
  { key: "4X6", label: "4x6" },
  { key: "4X6_PREPICADO", label: "4x6 PREPICADO" },
] as const;

export const blackBoxNumber = (assetCode: string) => Number(assetCode.slice(-2));

export function blackBoxStock(metadata: Record<string, unknown>) {
  const value = Number(metadata.blackBoxPhotoStock ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function blackBoxPaperFormat(metadata: Record<string, unknown>) {
  return metadata.blackBoxPaperFormat === "4X6_PREPICADO" ? "4X6_PREPICADO" : "4X6";
}

export async function loadBoxes(client: SupabaseClient) {
  // The legacy detail layer continues to support asset_type BOX; the Master uses CASE-01..09.
  const { data: boxes, error } = await client
    .from("operational_assets")
    .select("id,asset_code,asset_type,status,metadata,version,updated_at,updated_by,notes,storage_location")
    .eq("asset_type", "CASE")
    .in("asset_code", MASTER_BLACK_BOX_CODES)
    .is("deleted_at", null)
    .order("asset_code");
  if (error) throw error;
  const updatedByIds = [...new Set((boxes ?? []).map((box) => box.updated_by).filter(Boolean))] as string[];
  const { data: profiles, error: profilesError } = updatedByIds.length
    ? await client.from("profiles").select("id,display_name").in("id", updatedByIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profileNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const assetIds = (boxes ?? []).map((box) => box.id);
  const { data: assignments, error: assignmentsError } = assetIds.length
    ? await client.from("asset_assignments").select("id,asset_id,project_id,planned_start_at,planned_end_at,projects(id,name,event_date,event_time)").in("asset_id", assetIds).eq("assignment_status", "ASSIGNED").is("deleted_at", null).order("planned_start_at")
    : { data: [], error: null };
  if (assignmentsError) throw assignmentsError;
  const assignmentsByAsset = new Map<string, BoxEventAssignment[]>();
  for (const assignment of assignments ?? []) {
    const project = Array.isArray(assignment.projects) ? assignment.projects[0] : assignment.projects;
    const item: BoxEventAssignment = { id: assignment.id, projectId: assignment.project_id, eventName: project?.name ?? "Evento", eventDate: project?.event_date ?? "", eventTime: project?.event_time ?? "", plannedStartAt: assignment.planned_start_at, plannedEndAt: assignment.planned_end_at };
    assignmentsByAsset.set(assignment.asset_id, [...(assignmentsByAsset.get(assignment.asset_id) ?? []), item]);
  }
  return (boxes ?? []).map((box) => ({
    ...box,
    updated_by_name: box.updated_by ? profileNames.get(box.updated_by) ?? null : null,
    assignments: assignmentsByAsset.get(box.id) ?? [],
  })) as BoxAsset[];
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
  const [children, assignments, mediaLots, formats] = await Promise.all([
    client.from("operational_assets").select("id,asset_code,asset_type,status,metadata,serial_number,notes").eq("parent_asset_id", assetId).is("deleted_at", null).order("asset_code"),
    client.from("asset_assignments").select("id,project_id,assignment_status,planned_start_at,planned_end_at,projects(name,event_date,event_time)").eq("asset_id", assetId).is("deleted_at", null).order("planned_start_at", { ascending: false }),
    client.from("box_media_lots").select("id,supply_id,box_asset_id,printer_asset_id,format_key,lot,loaded_at,initial_photo_capacity,remaining_photo_capacity,low_stock_threshold,status,notes,box_media_formats(label)").eq("box_asset_id", assetId).order("loaded_at", { ascending: false }),
    client.from("box_media_formats").select("format_key,label").eq("enabled", true).order("label"),
  ]);
  if (children.error) throw children.error;
  if (assignments.error) throw assignments.error;
  if (mediaLots.error) throw mediaLots.error;
  if (formats.error) throw formats.error;
  const assignmentIds = (assignments.data ?? []).map((assignment) => assignment.id);
  const inspections = assignmentIds.length
    ? await client.from("asset_assignment_inspections").select("id,asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,evidence_ref,inspected_at").in("asset_assignment_id", assignmentIds).order("inspected_at", { ascending: false })
    : { data: [], error: null };
  if (inspections.error) throw inspections.error;
  const lotIds = (mediaLots.data ?? []).map((lot) => lot.id);
  const movements = lotIds.length
    ? await client.from("inventory_movements").select("id,media_lot_id,movement_type,quantity,quantity_before,quantity_delta,quantity_after,occurred_at,reason,project_id,orbit_event_id,staff_id").in("media_lot_id", lotIds).order("occurred_at", { ascending: false })
    : { data: [], error: null };
  if (movements.error) throw movements.error;
  const supplyIds = [...new Set((mediaLots.data ?? []).map((lot) => lot.supply_id))];
  const supplies = supplyIds.length
    ? await client.from("supplies").select("id,name,catalog_code,current_stock,minimum_stock,stock_status").in("id", supplyIds)
    : { data: [], error: null };
  if (supplies.error) throw supplies.error;
  return { box, children: children.data ?? [], assignments: assignments.data ?? [], inspections: inspections.data ?? [], mediaLots: mediaLots.data ?? [], mediaMovements: movements.data ?? [], mediaFormats: formats.data ?? [], supplies: supplies.data ?? [] };
}

export async function loadBoxHistory(client: SupabaseClient, assetId: string) {
  const [boxResult, assignmentsResult, snapshotsResult] = await Promise.all([
    client.from("operational_assets").select("id,asset_code,asset_type,status,metadata,storage_location").eq("id", assetId).in("asset_type", ["CASE", "BOX"]).is("deleted_at", null).maybeSingle(),
    client.from("asset_assignments").select("id,project_id,assignment_status,planned_start_at,planned_end_at,assigned_at,returned_at,return_condition,return_notes,projects(id,name,event_date,event_time,event_time_mode,location,assignments(staff_id,assignment_type,status,staff(first_name,last_name)))").eq("asset_id", assetId).is("deleted_at", null).order("planned_start_at", { ascending: false }),
    client.from("event_paper_snapshots").select("id,project_id,asset_assignment_id,status,opening_balance,event_usage,final_remaining_balance,confirmed_at,overridden_at,close_note,master_stock_before,master_stock_after,created_at").eq("box_asset_id", assetId).order("created_at", { ascending: false }),
  ]);
  if (boxResult.error) throw boxResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (snapshotsResult.error) throw snapshotsResult.error;
  if (!boxResult.data) return null;
  const snapshotsByAssignment = new Map((snapshotsResult.data ?? []).map((snapshot) => [snapshot.asset_assignment_id, snapshot]));
  const events = (assignmentsResult.data ?? []).map((assignment) => {
    const project = Array.isArray(assignment.projects) ? assignment.projects[0] : assignment.projects;
    return {
      assignment,
      project,
      snapshot: snapshotsByAssignment.get(assignment.id) ?? null,
    };
  });
  return { box: boxResult.data, events };
}

import { createOperationsBoardSnapshot, OperationsBoard } from "@/features/resources";
import type { OperationsBoardInput, ResourceStatus } from "@/features/resources";
import { EquipmentOperationCenter } from "@/features/resources/equipment-operation-center";
import type { EquipmentHistoryEntry } from "@/features/resources/equipment-operation-center";
import type { EquipmentItem } from "@/features/resources/equipment-operation-center.actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ResourcesPage() {
  const client = await createSupabaseServerClient();
  const [{ data: staff, error: staffError }, { data: assignments, error: assignmentError }, { data: projects, error: projectError }, { data: assets, error: assetError }, { data: assetHistory, error: historyError }] = await Promise.all([
    client.from("staff").select("id,first_name,last_name,availability,status").is("deleted_at", null),
    client.from("assignments").select("id,project_id,staff_id,status,resources").is("deleted_at", null),
    client.from("projects").select("id,name,event_date").is("deleted_at", null),
    client.from("operational_assets").select("id,asset_code,asset_type,status,usage_counter,version,metadata").is("deleted_at", null).order("asset_code"),
    client.from("asset_history").select("id,asset_id,message,occurred_at").order("occurred_at", { ascending: false }).limit(500),
  ]);
  if (staffError) throw staffError;
  if (assignmentError) throw assignmentError;
  if (projectError) throw projectError;
  if (assetError) throw assetError;
  if (historyError) throw historyError;
  const projectMap = new Map((projects ?? []).map((project) => [project.id, project.name]));
  const status = (value: string): ResourceStatus => value === "APPROVED" || value === "ACCEPTED" ? "RESERVED" : value === "ACTIVE" ? "IN_USE" : "AVAILABLE";
  const resourceValues = (key: string) => [...new Set((assignments ?? []).map((item) => (item.resources as Record<string, unknown> | null)?.[key]).filter((value): value is string => typeof value === "string" && value.length > 0))];
  const input: OperationsBoardInput = {
    blackBoxes: resourceValues("blackBox").map((number) => ({ id: number, number, status: "RESERVED", maintenanceStatus: "HEALTHY" })),
    booths: resourceValues("booth").map((number) => ({ id: number, number, status: "RESERVED", maintenanceStatus: "HEALTHY" })),
    vehicles: resourceValues("vehicle").map((name) => ({ id: name, name, plate: "Sin registro", status: "RESERVED", currentKm: 0, remainingMaintenanceKm: 0, maintenanceStatus: "HEALTHY" })),
    operators: (staff ?? []).map((member) => { const current = (assignments ?? []).find((item) => item.staff_id === member.id); return { id: member.id, name: `${member.first_name} ${member.last_name}`, currentAssignment: current ? projectMap.get(current.project_id) : undefined, availability: typeof member.availability === "object" ? "Disponibilidad registrada" : "Sin disponibilidad registrada", todayEvents: (assignments ?? []).filter((item) => item.staff_id === member.id).length, status: current ? status(current.status) : member.status === "ACTIVE" ? "AVAILABLE" : "UNAVAILABLE" }; }),
    capacityIndicators: [], alerts: [],
  };
  const equipment = (assets ?? []).map((asset): EquipmentItem => {
    const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
    return {
      id: asset.id,
      code: asset.asset_code,
      name: typeof metadata.name === "string" && metadata.name.trim() ? metadata.name : asset.asset_code,
      category: asset.asset_type as EquipmentItem["category"],
      status: asset.status as EquipmentItem["status"],
      usageCount: asset.usage_counter,
      version: asset.version,
    };
  });
  const equipmentHistory = (assetHistory ?? []).map((entry): EquipmentHistoryEntry => ({ id: entry.id, assetId: entry.asset_id, message: entry.message, occurredAt: entry.occurred_at }));
  return <div className="space-y-12"><EquipmentOperationCenter initialItems={equipment} historyEntries={equipmentHistory} /><OperationsBoard snapshot={createOperationsBoardSnapshot(input)} /></div>;
}

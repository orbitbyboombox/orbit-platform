import { createOperationsBoardSnapshot, OperationsBoard } from "@/features/resources";
import type { OperationsBoardInput, ResourceStatus } from "@/features/resources";
import { EquipmentOperationCenter } from "@/features/resources/equipment-operation-center";
import type { EquipmentHistoryEntry } from "@/features/resources/equipment-operation-center";
import type { EquipmentItem } from "@/features/resources/equipment-operation-center.actions";
import { ResourceCenter } from "@/features/resources/resource-center";
import type { OperationalResource, ResourceCategory } from "@/features/resources/resource-center.actions";
import { FleetCenter } from "@/features/resources/fleet-center";
import type { FleetVehicle, FuelLog } from "@/features/resources/fleet-center.actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ResourcesPage() {
  const client = await createSupabaseServerClient();
  const [{ data: staff, error: staffError }, { data: assignments, error: assignmentError }, { data: projects, error: projectError }, { data: assets, error: assetError }, { data: assetHistory, error: historyError }, { data: supplies, error: supplyError }, { data: vehicleProfiles, error: vehicleError }, { data: fuelLogs, error: fuelError }] = await Promise.all([
    client.from("staff").select("id,first_name,last_name,rut,role,availability,status,version").is("deleted_at", null),
    client.from("assignments").select("id,project_id,staff_id,status,resources").is("deleted_at", null),
    client.from("projects").select("id,name,event_date").is("deleted_at", null),
    client.from("operational_assets").select("id,asset_code,asset_type,status,usage_counter,version,metadata").is("deleted_at", null).order("asset_code"),
    client.from("asset_history").select("id,asset_id,message,occurred_at").order("occurred_at", { ascending: false }).limit(500),
    client.from("supplies").select("id,catalog_code,name,status,version").is("deleted_at", null).order("name"),
    client.from("vehicle_profiles").select("asset_id,nickname,model,plate,fuel_type,current_mileage,insurance_expiration,technical_inspection_expiration,operational_status,notes,version,operational_assets!inner(asset_code,status,deleted_at)").is("operational_assets.deleted_at", null).order("model"),
    client.from("vehicle_fuel_logs").select("id,asset_id,fuel_date,fuel_type,litres,total_amount,gas_station,receipt_path").order("fuel_date", { ascending: false }),
  ]);
  if (staffError) throw staffError;
  if (assignmentError) throw assignmentError;
  if (projectError) throw projectError;
  if (assetError) throw assetError;
  if (historyError) throw historyError;
  if (supplyError) throw supplyError;
  if (vehicleError) throw vehicleError;
  if (fuelError) throw fuelError;
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
  const assetCategory = (asset: { asset_type: string }, metadata: Record<string, unknown>): ResourceCategory => {
    if (["EQUIPMENT", "VEHICLES", "ACCESSORIES"].includes(String(metadata.resourceCategory))) return metadata.resourceCategory as ResourceCategory;
    if (asset.asset_type === "VEHICLE") return "VEHICLES";
    if (asset.asset_type === "ACCESSORY") return "ACCESSORIES";
    return "EQUIPMENT";
  };
  const resources: OperationalResource[] = [
    ...(assets ?? []).filter((asset) => asset.asset_type !== "VEHICLE").map((asset) => { const metadata = (asset.metadata ?? {}) as Record<string, unknown>; return { id: asset.id, source: "ASSET" as const, category: assetCategory(asset, metadata), name: typeof metadata.name === "string" ? metadata.name : asset.asset_code, code: asset.asset_code, status: asset.status, enabled: asset.status !== "OUT_OF_SERVICE", version: asset.version }; }),
    ...(supplies ?? []).map((supply) => ({ id: supply.id, source: "SUPPLY" as const, category: "CONSUMABLES" as const, name: supply.name, code: supply.catalog_code, status: supply.status, enabled: supply.status !== "INACTIVE", version: supply.version })),
    ...(staff ?? []).filter((member) => ["OPERATOR", "INSTALLATION", "REMOVAL"].includes(member.role)).map((member) => ({ id: member.id, source: "STAFF" as const, category: member.role === "OPERATOR" ? "OPERATORS" as const : "ASSISTANTS" as const, name: `${member.first_name} ${member.last_name}`, code: member.rut ?? member.id, status: member.status, enabled: member.status === "ACTIVE", version: member.version })),
  ];
  const fuelEntries: FuelLog[] = (fuelLogs ?? []).map((entry) => ({ id: entry.id, assetId: entry.asset_id, date: entry.fuel_date, fuelType: entry.fuel_type as FuelLog["fuelType"], litres: Number(entry.litres), totalAmount: Number(entry.total_amount), gasStation: entry.gas_station, receiptPath: entry.receipt_path }));
  const fuelTotals = new Map<string, number>(); fuelEntries.forEach((entry) => fuelTotals.set(entry.assetId, (fuelTotals.get(entry.assetId) ?? 0) + entry.totalAmount));
  const fleet: FleetVehicle[] = (vehicleProfiles ?? []).map((profile) => { const linked = Array.isArray(profile.operational_assets) ? profile.operational_assets[0] : profile.operational_assets; return { id: profile.asset_id, code: linked.asset_code, nickname: profile.nickname ?? "", model: profile.model, plate: profile.plate ?? "", fuelType: profile.fuel_type as FleetVehicle["fuelType"], currentMileage: profile.current_mileage === null ? null : Number(profile.current_mileage), insuranceExpiration: profile.insurance_expiration ?? "", technicalInspectionExpiration: profile.technical_inspection_expiration ?? "", operationalStatus: profile.operational_status as FleetVehicle["operationalStatus"], notes: profile.notes ?? "", enabled: linked.status !== "OUT_OF_SERVICE", version: profile.version, fuelTotal: fuelTotals.get(profile.asset_id) ?? 0 }; });
  const projectOptions = (projects ?? []).map((project) => ({ id: project.id, label: `${project.name} · ${project.event_date}` }));
  const driverOptions = (staff ?? []).filter((member) => member.status === "ACTIVE").map((member) => ({ id: member.id, label: `${member.first_name} ${member.last_name}` }));
  return <div className="space-y-12"><ResourceCenter initialItems={resources} /><FleetCenter initialVehicles={fleet} initialFuelLogs={fuelEntries} projects={projectOptions} drivers={driverOptions} /><details className="rounded-2xl border bg-card p-5"><summary className="cursor-pointer font-semibold">Gestión detallada e historial de equipamiento</summary><div className="mt-6"><EquipmentOperationCenter initialItems={equipment} historyEntries={equipmentHistory} /></div></details><OperationsBoard snapshot={createOperationsBoardSnapshot(input)} /></div>;
}

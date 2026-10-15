import { redirect } from "next/navigation";
import { BlackBoxMaster } from "@/features/resources/black-box-master";
import { loadBoxes } from "@/features/resources/box-inventory";
import type { InventoryMovement, SupplyInventoryItem } from "@/features/supply-engine/types/supply.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

export default async function BoxesPage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const [boxes, eventsResult, suppliesResult, movementsResult] = await Promise.all([
    loadBoxes(client),
    client.from("projects").select("id,name,event_date,event_time,event_time_mode,project_services(service_code)").is("deleted_at", null).gte("event_date", today()).lte("event_date", addDays(today(), 90)).order("event_date").order("event_time").limit(100),
    client.from("supplies").select("id,catalog_code,name,supplier,purchase_price,vat_included,unit,calculation_method,status,version,updated_at,current_stock,minimum_stock,recommended_purchase,stock_status,metadata").is("deleted_at", null).order("name"),
    client.from("inventory_movements").select("id,supply_id,orbit_event_id,customer_id,project_id,staff_id,vehicle_id,movement_type,quantity,unit_cost,total_cost,occurred_at,reason,version").is("deleted_at", null).order("occurred_at", { ascending: false }).limit(500),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (suppliesResult.error) throw suppliesResult.error;
  if (movementsResult.error) throw movementsResult.error;
  const supplies: SupplyInventoryItem[] = (suppliesResult.data ?? []).map((supply) => ({ recordId: supply.id, id: supply.catalog_code, name: supply.name, supplier: supply.supplier ?? "Sin proveedor registrado", purchasePrice: Number(supply.purchase_price ?? 0), vatIncluded: Boolean(supply.vat_included), unit: supply.unit, usefulLife: "Sin registrar", calculationMethod: supply.calculation_method, lastUpdated: supply.updated_at, status: supply.status, version: supply.version, currentStock: Number(supply.current_stock ?? 0), minimumStock: supply.minimum_stock == null ? undefined : Number(supply.minimum_stock), recommendedPurchase: supply.recommended_purchase == null ? undefined : Number(supply.recommended_purchase), stockStatus: supply.stock_status, metadata: supply.metadata } as SupplyInventoryItem));
  const movements: InventoryMovement[] = (movementsResult.data ?? []).map((movement) => ({ id: movement.id, supplyId: movement.supply_id, orbitEventId: movement.orbit_event_id ?? undefined, customerId: movement.customer_id ?? undefined, projectId: movement.project_id ?? undefined, staffId: movement.staff_id ?? undefined, vehicleId: movement.vehicle_id ?? undefined, movementType: movement.movement_type as InventoryMovement["movementType"], quantity: Number(movement.quantity), unitCost: movement.unit_cost == null ? undefined : Number(movement.unit_cost), totalCost: movement.total_cost == null ? undefined : Number(movement.total_cost), occurredAt: movement.occurred_at, reason: movement.reason, version: movement.version }));
  const events = (eventsResult.data ?? []).map((event) => ({ id: event.id, name: event.name, date: event.event_date, time: event.event_time, service: Array.isArray(event.project_services) ? event.project_services.map((item) => item.service_code).filter(Boolean).join(" + ") : "" }));
  const warehousePhotos = supplies.filter((supply) => supply.unit === "PHOTO").reduce((total, supply) => total + Math.max(0, supply.currentStock), 0);
  return <main className="space-y-4"><BlackBoxMaster initialBoxes={boxes} events={events} movements={movements} warehousePhotos={warehousePhotos} supplies={supplies} /></main>;
}

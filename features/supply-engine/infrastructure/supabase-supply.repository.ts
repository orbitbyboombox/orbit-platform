import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryMovement, SupplyInventoryItem } from "../types/supply.types";
import type {
  InventoryMovementDraft,
  SupplyDraft,
  SupplyRepository,
  SupplyUpdate,
} from "./supply.repository";

interface SupplyRow {
  id: string;
  catalog_code: string;
  name: string;
  supplier: string | null;
  purchase_price: number | string;
  vat_included: boolean;
  unit: SupplyInventoryItem["unit"];
  calculation_method: SupplyInventoryItem["calculationMethod"];
  status: SupplyInventoryItem["status"];
  version: number;
  updated_at: string;
  current_stock: number | string;
  minimum_stock: number | string | null;
  recommended_purchase: number | string | null;
  stock_status: SupplyInventoryItem["stockStatus"];
  metadata: Record<string, unknown>;
}

interface MovementRow {
  id: string;
  supply_id: string;
  orbit_event_id: string | null;
  customer_id: string | null;
  project_id: string | null;
  staff_id: string | null;
  vehicle_id: string | null;
  movement_type: InventoryMovement["movementType"];
  quantity: number | string;
  unit_cost: number | string | null;
  total_cost: number | string | null;
  occurred_at: string;
  reason: string;
  version: number;
}

const numberValue = (value: number | string | null | undefined): number | undefined => value == null ? undefined : Number(value);
const text = (value: unknown, fallback: string): string => typeof value === "string" ? value : fallback;
const optionalNumber = (value: unknown): number | undefined => typeof value === "number" ? value : undefined;
const stringList = (value: unknown): readonly string[] | undefined => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;

export class SupabaseSupplyRepository implements SupplyRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findAll(): Promise<readonly SupplyInventoryItem[]> {
    const { data, error } = await this.client
      .from("supplies")
      .select("id,catalog_code,name,supplier,purchase_price,vat_included,unit,calculation_method,status,version,updated_at,current_stock,minimum_stock,recommended_purchase,stock_status,metadata")
      .is("deleted_at", null)
      .order("name");
    if (error) throw error;
    return (data as SupplyRow[]).map((row) => this.toSupply(row));
  }

  async findMovements(supplyId?: string): Promise<readonly InventoryMovement[]> {
    let query = this.client
      .from("inventory_movements")
      .select("id,supply_id,orbit_event_id,customer_id,project_id,staff_id,vehicle_id,movement_type,quantity,unit_cost,total_cost,occurred_at,reason,version")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false });
    if (supplyId) query = query.eq("supply_id", supplyId);
    const { data, error } = await query;
    if (error) throw error;
    return (data as MovementRow[]).map((row) => ({
      id: row.id,
      supplyId: row.supply_id,
      orbitEventId: row.orbit_event_id ?? undefined,
      customerId: row.customer_id ?? undefined,
      projectId: row.project_id ?? undefined,
      staffId: row.staff_id ?? undefined,
      vehicleId: row.vehicle_id ?? undefined,
      movementType: row.movement_type,
      quantity: Number(row.quantity),
      unitCost: numberValue(row.unit_cost),
      totalCost: numberValue(row.total_cost),
      occurredAt: row.occurred_at,
      reason: row.reason,
      version: row.version,
    }));
  }

  async create(input: SupplyDraft): Promise<string> {
    const actorId = await this.actorId();
    const { data, error } = await this.client.from("supplies").insert(this.toRecord(input, actorId)).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async update(input: SupplyUpdate): Promise<void> {
    const actorId = await this.actorId();
    const patch = this.toRecord(input, actorId);
    delete patch.catalog_code;
    delete patch.created_by;
    await this.versionedUpdate(input.supplyId, input.expectedVersion, { ...patch, approval_reason: input.reason });
  }

  async registerMovement(input: InventoryMovementDraft): Promise<string> {
    const actorId = await this.actorId();
    const signedQuantity = input.movementType === "CONSUMPTION" || input.movementType === "LOSS"
      ? -Math.abs(input.quantity)
      : input.movementType === "ADJUSTMENT"
        ? input.quantity
        : Math.abs(input.quantity);
    const { data, error } = await this.client.rpc("register_inventory_movement", {
      p_supply_id: input.supplyId,
      p_movement_type: input.movementType,
      p_quantity: signedQuantity,
      p_occurred_at: input.occurredAt,
      p_reason: input.reason,
      p_orbit_event_id: input.orbitEventId ?? null,
      p_customer_id: input.customerId ?? null,
      p_project_id: input.projectId ?? null,
      p_staff_id: input.staffId ?? null,
      p_vehicle_id: input.vehicleId ?? null,
      p_unit_cost: input.unitCost ?? null,
      p_actor_id: actorId,
    });
    if (error) throw error;
    return data as string;
  }

  async softDelete(supplyId: string, expectedVersion: number, reason: string): Promise<void> {
    const actorId = await this.actorId();
    await this.versionedUpdate(supplyId, expectedVersion, { deleted_at: new Date().toISOString(), deleted_by: actorId, updated_by: actorId, approval_reason: reason });
  }

  async restore(supplyId: string, expectedVersion: number, reason: string): Promise<void> {
    const actorId = await this.actorId();
    await this.versionedUpdate(supplyId, expectedVersion, { deleted_at: null, deleted_by: null, updated_by: actorId, approval_reason: reason });
  }

  private toRecord(input: Partial<SupplyDraft>, actorId: string): Record<string, unknown> {
    const record: Record<string, unknown> = { updated_by: actorId };
    if (input.catalogCode !== undefined) record.catalog_code = input.catalogCode;
    if (input.name !== undefined) record.name = input.name;
    if (input.supplier !== undefined) record.supplier = input.supplier;
    if (input.purchasePrice !== undefined) record.purchase_price = input.purchasePrice;
    if (input.vatIncluded !== undefined) record.vat_included = input.vatIncluded;
    if (input.unit !== undefined) record.unit = input.unit;
    if (input.calculationMethod !== undefined) record.calculation_method = input.calculationMethod;
    if (input.status !== undefined) record.status = input.status;
    if (input.currentStock !== undefined) record.current_stock = input.currentStock;
    if (input.minimumStock !== undefined) record.minimum_stock = input.minimumStock;
    if (input.recommendedPurchase !== undefined) record.recommended_purchase = input.recommendedPurchase;
    const metadataEntries = {
      usefulLifeLabel: input.usefulLife,
      productionUnits: input.productionUnits,
      operationalCapacityEvents: input.operationalCapacityEvents,
      additionalCostBeforeVat: input.additionalCostBeforeVat,
      standardQuantity: input.standardQuantity,
      usefulLifeMonths: input.usefulLifeMonths,
      contents: input.contents,
    };
    const metadata = Object.fromEntries(Object.entries(metadataEntries).filter(([, value]) => value !== undefined));
    if (Object.keys(metadata).length > 0) record.metadata = metadata;
    if (input.catalogCode !== undefined) record.created_by = actorId;
    return record;
  }

  private toSupply(row: SupplyRow): SupplyInventoryItem {
    return {
      recordId: row.id,
      id: row.catalog_code,
      name: row.name,
      supplier: row.supplier ?? "Sin proveedor registrado",
      purchasePrice: Number(row.purchase_price),
      vatIncluded: row.vat_included,
      unit: row.unit,
      usefulLife: text(row.metadata.usefulLifeLabel, "Sin vida útil registrada"),
      calculationMethod: row.calculation_method,
      lastUpdated: new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" }).format(new Date(row.updated_at)),
      status: row.status,
      version: row.version,
      currentStock: Number(row.current_stock),
      minimumStock: numberValue(row.minimum_stock),
      recommendedPurchase: numberValue(row.recommended_purchase),
      stockStatus: row.stock_status,
      productionUnits: optionalNumber(row.metadata.productionUnits),
      operationalCapacityEvents: optionalNumber(row.metadata.operationalCapacityEvents),
      additionalCostBeforeVat: optionalNumber(row.metadata.additionalCostBeforeVat),
      standardQuantity: optionalNumber(row.metadata.standardQuantity),
      usefulLifeMonths: optionalNumber(row.metadata.usefulLifeMonths),
      contents: stringList(row.metadata.contents),
    };
  }

  private async actorId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw error ?? new Error("Sesión requerida.");
    return data.user.id;
  }

  private async versionedUpdate(id: string, version: number, patch: Record<string, unknown>): Promise<void> {
    const { data, error } = await this.client.from("supplies").update(patch).eq("id", id).eq("version", version).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("El registro fue modificado por otra sesión. Recarga antes de continuar.");
  }
}

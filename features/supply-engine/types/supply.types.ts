export type SupplyStatus = "ACTIVE" | "LOW_STOCK" | "INACTIVE";

export type SupplyUnit = "PHOTO" | "EVENT" | "MONTH";

export type SupplyCalculationMethod = "PRODUCTION_OUTPUT" | "EVENT_CAPACITY" | "DIRECT_EVENT_COST" | "MONTHLY_AMORTIZATION";

export interface SupplyDefinition {
  id: string;
  name: string;
  supplier: string;
  purchasePrice: number;
  vatIncluded: boolean;
  unit: SupplyUnit;
  usefulLife: string;
  calculationMethod: SupplyCalculationMethod;
  lastUpdated: string;
  status: SupplyStatus;
  productionUnits?: number;
  operationalCapacityEvents?: number;
  additionalCostBeforeVat?: number;
  standardQuantity?: number;
  usefulLifeMonths?: number;
  contents?: readonly string[];
}

export type InventoryMovementType = "PURCHASE" | "CONSUMPTION" | "ADJUSTMENT" | "LOSS" | "REPLACEMENT";

export interface SupplyInventoryItem extends SupplyDefinition {
  recordId: string;
  version: number;
  currentStock: number;
  minimumStock?: number;
  recommendedPurchase?: number;
  stockStatus: "NORMAL" | "LOW_STOCK" | "OUT_OF_STOCK";
}

export interface InventoryMovement {
  id: string;
  supplyId: string;
  orbitEventId?: string;
  customerId?: string;
  projectId?: string;
  staffId?: string;
  vehicleId?: string;
  movementType: InventoryMovementType;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  occurredAt: string;
  reason: string;
  version: number;
}

export interface SupplyCost {
  supplyId: string;
  unit: SupplyUnit;
  costPerUnit: number;
}

export interface SupplyUsage {
  supplyId: string;
  quantity: number;
}

export interface SupplyUsageCost extends SupplyUsage {
  costPerUnit: number;
  totalCost: number;
}

export interface SupplyCostResolver {
  getSupplyCost(supplyId: string): SupplyCost;
  calculateUsageCost(usage: SupplyUsage): SupplyUsageCost;
}

import type {
  InventoryMovement,
  InventoryMovementType,
  SupplyCalculationMethod,
  SupplyInventoryItem,
  SupplyStatus,
  SupplyUnit,
} from "../types/supply.types";

export interface SupplyDraft {
  catalogCode: string;
  name: string;
  supplier: string;
  purchasePrice: number;
  vatIncluded: boolean;
  unit: SupplyUnit;
  usefulLife: string;
  calculationMethod: SupplyCalculationMethod;
  status: SupplyStatus;
  productionUnits?: number;
  operationalCapacityEvents?: number;
  additionalCostBeforeVat?: number;
  standardQuantity?: number;
  usefulLifeMonths?: number;
  contents?: readonly string[];
  currentStock?: number;
  minimumStock?: number;
  recommendedPurchase?: number;
}

export interface SupplyUpdate extends Partial<Omit<SupplyDraft, "catalogCode">> {
  supplyId: string;
  expectedVersion: number;
  reason: string;
}

export interface InventoryMovementDraft {
  supplyId: string;
  movementType: InventoryMovementType;
  quantity: number;
  orbitEventId?: string;
  customerId?: string;
  projectId?: string;
  staffId?: string;
  vehicleId?: string;
  unitCost?: number;
  occurredAt: string;
  reason: string;
}

export interface SupplyRepository {
  findAll(): Promise<readonly SupplyInventoryItem[]>;
  findMovements(supplyId?: string): Promise<readonly InventoryMovement[]>;
  create(input: SupplyDraft): Promise<string>;
  update(input: SupplyUpdate): Promise<void>;
  registerMovement(input: InventoryMovementDraft): Promise<string>;
  softDelete(supplyId: string, expectedVersion: number, reason: string): Promise<void>;
  restore(supplyId: string, expectedVersion: number, reason: string): Promise<void>;
}

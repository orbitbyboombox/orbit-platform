import { CHILE_VAT_RATE } from "@/features/business-core";
import type {
  SupplyCost,
  SupplyCostResolver,
  SupplyDefinition,
  SupplyUsage,
  SupplyUsageCost,
} from "../types/supply.types";

export class SupplyNotFoundError extends Error {
  constructor(supplyId: string) {
    super(`Supply not found: ${supplyId}`);
    this.name = "SupplyNotFoundError";
  }
}

export function calculateSupplyCost(supply: SupplyDefinition): SupplyCost {
  let costPerUnit: number;

  switch (supply.calculationMethod) {
    case "PRODUCTION_OUTPUT":
      costPerUnit = supply.purchasePrice / (supply.productionUnits ?? 1);
      break;
    case "EVENT_CAPACITY": {
      const additionalCost = (supply.additionalCostBeforeVat ?? 0) * (1 + CHILE_VAT_RATE);
      costPerUnit = (supply.purchasePrice + additionalCost) / (supply.operationalCapacityEvents ?? 1);
      break;
    }
    case "DIRECT_EVENT_COST":
      costPerUnit = supply.purchasePrice;
      break;
    case "MONTHLY_AMORTIZATION":
      costPerUnit = (supply.purchasePrice * (supply.standardQuantity ?? 1)) / (supply.usefulLifeMonths ?? 1);
      break;
  }

  return { supplyId: supply.id, unit: supply.unit, costPerUnit };
}

export class SupplyEngine implements SupplyCostResolver {
  constructor(private readonly catalog: readonly SupplyDefinition[]) {}

  getSupplyCost(supplyId: string): SupplyCost {
    const supply = this.catalog.find(({ id }) => id === supplyId);
    if (!supply) throw new SupplyNotFoundError(supplyId);
    return calculateSupplyCost(supply);
  }

  calculateUsageCost(usage: SupplyUsage): SupplyUsageCost {
    const cost = this.getSupplyCost(usage.supplyId);
    return { ...usage, costPerUnit: cost.costPerUnit, totalCost: cost.costPerUnit * usage.quantity };
  }
}

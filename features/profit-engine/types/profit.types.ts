import type { SupplyUsage } from "@/features/supply-engine";

export type FuelType = "GASOLINE_93";

export interface FuelPrice {
  fuelType: FuelType;
  pricePerLiter: number;
  source: string;
  observedAt: string;
}

export interface FuelPriceProvider {
  getCurrentPrice(fuelType: FuelType): Promise<FuelPrice>;
}

export interface VehicleCostInput {
  fuelType: FuelType;
  distanceKm: number;
  efficiencyKmPerLiter: number;
  fuelPricePerLiter: number;
  manualToll: number;
}

export interface EventProfitInput {
  eventId: string;
  eventName: string;
  service: string;
  revenue: number;
  staffCost: number;
  transportCost: number;
  vehicle: VehicleCostInput;
  supplies: readonly SupplyUsage[];
}

export interface EventProfitSummary {
  eventId: string;
  eventName: string;
  service: string;
  revenue: number;
  staffCost: number;
  transportCost: number;
  fuelCost: number;
  tollCost: number;
  suppliesCost: number;
  operationalCost: number;
  estimatedGrossMargin: number;
  grossMarginPercentage: number;
}

export interface ServiceProfitInsight {
  service: string;
  averageMargin: number;
  averageMarginPercentage: number;
  eventCount: number;
}

export interface ProfitInsights {
  services: readonly ServiceProfitInsight[];
  averageOperationalCost: number;
  highestProfitabilityService: string;
}

export interface ProfitRecommendation {
  title: string;
  reason: string;
}

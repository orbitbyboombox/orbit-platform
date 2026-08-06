import { INITIAL_SUPPLY_CATALOG, SupplyEngine } from "@/features/supply-engine";
import { ProfitEngine } from "../engine/profit-engine";
import type { EventProfitInput } from "../types/profit.types";

export const MOCK_FUEL_PRICE_PER_LITER = 1280;

export const MOCK_EVENT_PROFIT_INPUTS: readonly EventProfitInput[] = [
  {
    eventId: "event-classic-01",
    eventName: "Matrimonio · María y Felipe",
    service: "Classic",
    revenue: 650000,
    staffCost: 75000,
    transportCost: 45000,
    vehicle: { fuelType: "GASOLINE_93", distanceKm: 58, efficiencyKmPerLiter: 10, fuelPricePerLiter: MOCK_FUEL_PRICE_PER_LITER, manualToll: 0 },
    supplies: [{ supplyId: "dnp-rx1-media", quantity: 420 }, { supplyId: "scrapbook", quantity: 1 }, { supplyId: "pens", quantity: 0.25 }, { supplyId: "double-sided-tape", quantity: 0.25 }],
  },
  {
    eventId: "event-classic-02",
    eventName: "Cumpleaños · Fernanda Silva",
    service: "Classic",
    revenue: 590000,
    staffCost: 70000,
    transportCost: 35000,
    vehicle: { fuelType: "GASOLINE_93", distanceKm: 42, efficiencyKmPerLiter: 10, fuelPricePerLiter: MOCK_FUEL_PRICE_PER_LITER, manualToll: 0 },
    supplies: [{ supplyId: "dnp-rx1-media", quantity: 360 }, { supplyId: "scrapbook", quantity: 1 }, { supplyId: "pens", quantity: 0.25 }],
  },
  {
    eventId: "event-black-studio",
    eventName: "Empresa · Lumen Chile",
    service: "Black Studio",
    revenue: 780000,
    staffCost: 145000,
    transportCost: 85000,
    vehicle: { fuelType: "GASOLINE_93", distanceKm: 112, efficiencyKmPerLiter: 9, fuelPricePerLiter: MOCK_FUEL_PRICE_PER_LITER, manualToll: 8900 },
    supplies: [{ supplyId: "dnp-rx1-media", quantity: 520 }, { supplyId: "magnets", quantity: 1 }, { supplyId: "pens", quantity: 0.25 }, { supplyId: "double-sided-tape", quantity: 0.25 }],
  },
];

export const MOCK_SUPPLY_ENGINE = new SupplyEngine(INITIAL_SUPPLY_CATALOG);
export const MOCK_PROFIT_ENGINE = new ProfitEngine(MOCK_SUPPLY_ENGINE);
export const MOCK_EVENT_PROFIT_SUMMARIES = MOCK_EVENT_PROFIT_INPUTS.map((event) => MOCK_PROFIT_ENGINE.calculateEvent(event));
export const MOCK_PROFIT_INSIGHTS = MOCK_PROFIT_ENGINE.calculateInsights(MOCK_EVENT_PROFIT_SUMMARIES);
export const MOCK_PROFIT_RECOMMENDATION = MOCK_PROFIT_ENGINE.getRecommendation(MOCK_PROFIT_INSIGHTS);

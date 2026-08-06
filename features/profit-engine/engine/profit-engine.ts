import type { SupplyCostResolver } from "@/features/supply-engine";
import type {
  EventProfitInput,
  EventProfitSummary,
  ProfitInsights,
  ProfitRecommendation,
  ServiceProfitInsight,
  VehicleCostInput,
} from "../types/profit.types";

export function calculateEstimatedFuelCost(vehicle: VehicleCostInput): number {
  if (vehicle.efficiencyKmPerLiter <= 0) return 0;
  return (vehicle.distanceKm / vehicle.efficiencyKmPerLiter) * vehicle.fuelPricePerLiter;
}

export class ProfitEngine {
  constructor(private readonly supplies: SupplyCostResolver) {}

  calculateEvent(input: EventProfitInput): EventProfitSummary {
    const fuelCost = calculateEstimatedFuelCost(input.vehicle);
    const suppliesCost = input.supplies.reduce(
      (total, usage) => total + this.supplies.calculateUsageCost(usage).totalCost,
      0,
    );
    const operationalCost = input.staffCost + input.transportCost + fuelCost + input.vehicle.manualToll + suppliesCost;
    const estimatedGrossMargin = input.revenue - operationalCost;

    return {
      eventId: input.eventId,
      eventName: input.eventName,
      service: input.service,
      revenue: input.revenue,
      staffCost: input.staffCost,
      transportCost: input.transportCost,
      fuelCost,
      tollCost: input.vehicle.manualToll,
      suppliesCost,
      operationalCost,
      estimatedGrossMargin,
      grossMarginPercentage: input.revenue === 0 ? 0 : (estimatedGrossMargin / input.revenue) * 100,
    };
  }

  calculateInsights(events: readonly EventProfitSummary[]): ProfitInsights {
    const grouped = new Map<string, EventProfitSummary[]>();
    events.forEach((event) => grouped.set(event.service, [...(grouped.get(event.service) ?? []), event]));

    const services: ServiceProfitInsight[] = [...grouped.entries()].map(([service, serviceEvents]) => ({
      service,
      averageMargin: serviceEvents.reduce((sum, event) => sum + event.estimatedGrossMargin, 0) / serviceEvents.length,
      averageMarginPercentage: serviceEvents.reduce((sum, event) => sum + event.grossMarginPercentage, 0) / serviceEvents.length,
      eventCount: serviceEvents.length,
    }));
    const highest = [...services].sort((a, b) => b.averageMarginPercentage - a.averageMarginPercentage)[0];

    return {
      services,
      averageOperationalCost: events.length === 0 ? 0 : events.reduce((sum, event) => sum + event.operationalCost, 0) / events.length,
      highestProfitabilityService: highest?.service ?? "Sin datos",
    };
  }

  getRecommendation(insights: ProfitInsights): ProfitRecommendation {
    const service = insights.services.find(({ service }) => service === insights.highestProfitabilityService);
    if (!service) {
      return {
        title: "La rentabilidad aparecerá con el primer evento registrado.",
        reason: "Aún no existe información operacional suficiente para recomendar una acción.",
      };
    }
    return {
      title: `${insights.highestProfitabilityService} entrega actualmente el mayor margen promedio.`,
      reason: `Margen bruto estimado de ${service.averageMarginPercentage.toFixed(1)}% en la muestra operacional.`,
    };
  }
}

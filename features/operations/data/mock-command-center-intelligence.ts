import { ProjectState } from "@/features/projects/engine";
import type { OperationsIntelligenceInput } from "@/features/operations-intelligence";

export const COMMAND_CENTER_INTELLIGENCE_INPUT: OperationsIntelligenceInput = {
  events: [
    {
      id: "nova-summit-operation",
      projectId: "nova-summit",
      projectState: ProjectState.CONFIRMED,
      eventDate: "2026-08-06",
      serviceStartTime: "18:30",
      contractedHours: 4,
      location: "Metropolitan Santiago",
      geographicArea: "CENTRAL",
      operationalRisk: "LOW",
      blackBoxId: "black-box-04",
      boothId: "booth-black-studio-02",
      operatorId: null,
      estimatedTravelMinutesToNextEvent: 35,
    },
    {
      id: "cumpleanos-vicente-operation",
      projectId: "cumpleanos-vicente",
      projectState: ProjectState.CONFIRMED,
      eventDate: "2026-08-08",
      serviceStartTime: "17:00",
      contractedHours: 3,
      location: "Club de Polo",
      geographicArea: "CENTRAL",
      operationalRisk: "LOW",
      blackBoxId: "black-box-02",
      boothId: "booth-classic-03",
      operatorId: "operator-07",
    },
  ],
  vehicles: [
    { vehicleId: "CHANGAN_MD201", currentKm: 89_200, lastMaintenanceKm: 80_000 },
    { vehicleId: "KYC_X5_PLUS", currentKm: 42_350, lastMaintenanceKm: 40_000 },
  ],
};

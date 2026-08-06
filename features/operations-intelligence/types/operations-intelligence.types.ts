import type { DurationHours } from "@/features/business-core";
import type { ProjectState } from "@/features/projects/engine";

export type OperationalRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type GeographicArea = "NORTH" | "CENTRAL" | "SOUTH" | "OTHER";

export interface OperationalEvent {
  readonly id: string;
  readonly projectId: string;
  readonly projectState: ProjectState;
  readonly eventDate: string;
  readonly serviceStartTime: string;
  readonly contractedHours: DurationHours;
  readonly location: string;
  readonly geographicArea: GeographicArea;
  readonly operationalRisk: OperationalRisk;
  readonly blackBoxId: string | null;
  readonly boothId: string | null;
  readonly operatorId: string | null;
  readonly estimatedTravelMinutesToNextEvent?: number;
}

export interface OperationalWindowConfig {
  readonly mountingMinutes: number;
  readonly dismantlingMinutes: number;
  readonly operatorCallLeadMinutes: number;
  readonly lateEventThreshold: string;
  readonly operationalLimitTime: string;
  readonly warehouseName: string;
}

export interface OperationalTime {
  readonly time: string;
  readonly dayOffset: number;
}

export interface EventOperationalPlan {
  readonly eventId: string;
  readonly reservedBlackBoxes: 1;
  readonly reservedBooths: 1;
  readonly reservedOperators: 1;
  readonly operatorCallTime: OperationalTime;
  readonly serviceEndTime: OperationalTime;
  readonly mountingWindowMinutes: number;
  readonly dismantlingWindowMinutes: number;
  readonly routeOrigin: string;
  readonly recommendWarehouseReturn: boolean;
}

export type EquipmentReuseRejectionReason =
  | "LATE_EVENT"
  | "OUTSIDE_OPERATIONAL_LIMIT"
  | "INCOMPATIBLE_GEOGRAPHIC_AREA"
  | "INSUFFICIENT_OPERATIONAL_WINDOW"
  | "OPERATIONAL_RISK";

export interface EquipmentReuseEvaluation {
  readonly sourceEventId: string;
  readonly targetEventId: string;
  readonly recommended: boolean;
  readonly availableMinutes: number;
  readonly requiredMinutes: number;
  readonly rejectionReasons: readonly EquipmentReuseRejectionReason[];
}

export type VehicleId = "CHANGAN_MD201" | "KYC_X5_PLUS";
export type VehicleMaintenanceStatus = "NORMAL" | "UPCOMING" | "OVERDUE";

export interface OperationalVehicle {
  readonly id: VehicleId;
  readonly name: string;
  readonly year: number | null;
  readonly fuel: "GASOLINE_93";
  readonly body: "CLOSED";
  readonly heightMeters: number;
  readonly boothCapacity: 6;
  readonly blackBoxCapacity: 6;
  readonly maintenanceIntervalKm: 10_000;
}

export interface VehicleOdometerInput {
  readonly vehicleId: VehicleId;
  readonly currentKm: number;
  readonly lastMaintenanceKm: number;
}

export interface VehicleHealth {
  readonly vehicle: OperationalVehicle;
  readonly currentKm: number;
  readonly nextMaintenanceKm: number;
  readonly remainingKm: number;
  readonly maintenanceStatus: VehicleMaintenanceStatus;
}

export type OperationalRecommendationPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface OperationalRecommendation {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly impact: string;
  readonly actionLabel: string;
  readonly estimatedTime: string;
  readonly priority: OperationalRecommendationPriority;
  readonly eventId: string | null;
  readonly vehicleId: VehicleId | null;
}

export interface OperationsIntelligenceInput {
  readonly events: readonly OperationalEvent[];
  readonly vehicles: readonly VehicleOdometerInput[];
  readonly config?: Partial<OperationalWindowConfig>;
}

export interface OperationsIntelligenceResult {
  readonly plans: readonly EventOperationalPlan[];
  readonly reuseEvaluations: readonly EquipmentReuseEvaluation[];
  readonly vehicleHealth: readonly VehicleHealth[];
  readonly primaryRecommendation: OperationalRecommendation;
}

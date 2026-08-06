import type { EventTypeId, ServiceId } from "@/features/business-core";
import type {
  OperationalEvent,
  OperationalTime,
  OperationalVehicle,
  VehicleOdometerInput,
} from "@/features/operations-intelligence";

export type OperationalRouteDirection = "NORTH" | "SOUTH" | "EAST" | "WEST";

export interface DailyPlanningProject {
  readonly operationalEvent: OperationalEvent;
  readonly customer: string;
  readonly eventType: EventTypeId;
  readonly service: ServiceId;
  readonly commune: string;
  readonly routeDirection: OperationalRouteDirection;
  readonly estimatedTravelMinutesFromWarehouse: number;
  readonly projectedDistanceSavingsKm: number;
}

export interface PlannerOperator {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
}

export interface PlannerEquipment {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
}

export interface DailyOperationsPlannerInput {
  readonly planningDate: string;
  readonly projects: readonly DailyPlanningProject[];
  readonly operators: readonly PlannerOperator[];
  readonly blackBoxes: readonly PlannerEquipment[];
  readonly booths: readonly PlannerEquipment[];
  readonly vehicleOdometers: readonly VehicleOdometerInput[];
}

export type OperationalSequenceType = "MOUNTING" | "SERVICE" | "DISMANTLING";

export interface OperationalSequenceItem {
  readonly id: string;
  readonly eventId: string;
  readonly type: OperationalSequenceType;
  readonly title: string;
  readonly location: string;
  readonly start: OperationalTime;
  readonly end: OperationalTime;
}

export interface PlannedEvent {
  readonly project: DailyPlanningProject;
  readonly serviceEndTime: OperationalTime;
  readonly operatorCallTime: OperationalTime;
  readonly mountingWindowMinutes: number;
  readonly dismantlingWindowMinutes: number;
}

export interface ProposedOperationalRoute {
  readonly id: string;
  readonly direction: OperationalRouteDirection;
  readonly vehicle: OperationalVehicle | null;
  readonly operators: readonly PlannerOperator[];
  readonly blackBoxes: readonly PlannerEquipment[];
  readonly booths: readonly PlannerEquipment[];
  readonly departureTime: OperationalTime;
  readonly estimatedReturnTime: OperationalTime;
  readonly events: readonly PlannedEvent[];
  readonly sequence: readonly OperationalSequenceItem[];
  readonly projectedDistanceSavingsKm: number;
}

export type OperationalAlertType =
  | "OPERATOR_CONFLICT"
  | "VEHICLE_CONFLICT"
  | "BLACK_BOX_CONFLICT"
  | "BOOTH_CONFLICT"
  | "OPERATIONAL_RISK";

export type OperationalAlertSeverity = "CRITICAL" | "WARNING";

export interface OperationalPlanningAlert {
  readonly id: string;
  readonly type: OperationalAlertType;
  readonly severity: OperationalAlertSeverity;
  readonly routeDirection: OperationalRouteDirection | null;
  readonly eventId: string | null;
  readonly message: string;
}

export interface DailyPlanRecommendation {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface DailyOperationalPlan {
  readonly id: string;
  readonly planningDate: string;
  readonly status: "DRAFT";
  readonly requiresBoomboxApproval: true;
  readonly routes: readonly ProposedOperationalRoute[];
  readonly recommendations: readonly DailyPlanRecommendation[];
  readonly alerts: readonly OperationalPlanningAlert[];
}

export type ResourceStatus = "AVAILABLE" | "RESERVED" | "IN_USE" | "MAINTENANCE" | "UNAVAILABLE";

export type MaintenanceStatus = "HEALTHY" | "UPCOMING" | "OVERDUE";

export interface BlackBoxResource {
  id: string;
  number: string;
  status: ResourceStatus;
  currentEvent?: string;
  nextEvent?: string;
  maintenanceStatus: MaintenanceStatus;
}

export interface BoothResource {
  id: string;
  number: string;
  status: ResourceStatus;
  assignedBox?: string;
  currentEvent?: string;
  maintenanceStatus: MaintenanceStatus;
}

export interface VehicleResource {
  id: string;
  name: string;
  plate: string;
  status: ResourceStatus;
  currentRoute?: string;
  currentKm: number;
  remainingMaintenanceKm: number;
  maintenanceStatus: MaintenanceStatus;
}

export interface OperatorResource {
  id: string;
  name: string;
  currentAssignment?: string;
  availability: string;
  todayEvents: number;
  status: ResourceStatus;
}

export interface CapacityIndicator {
  id: string;
  label: string;
  percentage: number;
}

export type OperationalAlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface OperationalAlert {
  id: string;
  message: string;
  severity: OperationalAlertSeverity;
}

export interface OperationalRecommendation {
  title: string;
  reason: string;
  priority: OperationalAlertSeverity;
}

export interface ResourceAvailability {
  total: number;
  available: number;
  reserved: number;
  maintenance: number;
}

export interface DailyCapacity {
  boxes: ResourceAvailability;
  booths: ResourceAvailability;
  availableVehicles: number;
  availableOperators: number;
  operationalCapacityPercentage: number;
  potentialAdditionalEvents: number;
}

export interface OperationalHealth {
  healthyAssets: number;
  upcomingMaintenance: number;
  overdueMaintenance: number;
  vehicleAlerts: number;
}

export interface OperationsBoardInput {
  blackBoxes: readonly BlackBoxResource[];
  booths: readonly BoothResource[];
  vehicles: readonly VehicleResource[];
  operators: readonly OperatorResource[];
  capacityIndicators: readonly CapacityIndicator[];
  alerts: readonly OperationalAlert[];
}

export interface OperationsBoardSnapshot extends OperationsBoardInput {
  dailyCapacity: DailyCapacity;
  health: OperationalHealth;
  recommendation: OperationalRecommendation;
}

export interface CommandCenterOperationalIndicators {
  operationalCapacityPercentage: number;
  potentialAdditionalEvents: number;
  activeAlerts: number;
  upcomingMaintenance: number;
}

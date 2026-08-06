import type {
  CommandCenterOperationalIndicators,
  MaintenanceStatus,
  OperationalRecommendation,
  OperationsBoardInput,
  OperationsBoardSnapshot,
  ResourceAvailability,
  ResourceStatus,
} from "../types/operations-board.types";

function countStatuses(resources: readonly { status: ResourceStatus }[]): ResourceAvailability {
  return {
    total: resources.length,
    available: resources.filter(({ status }) => status === "AVAILABLE").length,
    reserved: resources.filter(({ status }) => status === "RESERVED" || status === "IN_USE").length,
    maintenance: resources.filter(({ status }) => status === "MAINTENANCE" || status === "UNAVAILABLE").length,
  };
}

function countMaintenance(
  resources: readonly { maintenanceStatus: MaintenanceStatus }[],
  status: MaintenanceStatus,
) {
  return resources.filter((resource) => resource.maintenanceStatus === status).length;
}

function selectRecommendation(input: OperationsBoardInput): OperationalRecommendation {
  if (![...input.blackBoxes, ...input.booths, ...input.vehicles, ...input.operators].length) {
    return { title: "Aún no hay recursos operacionales registrados.", reason: "Los indicadores se calcularán después de registrar Staff y asignaciones.", priority: "INFO" };
  }
  const overdueVehicle = input.vehicles.find(({ maintenanceStatus }) => maintenanceStatus === "OVERDUE");
  if (overdueVehicle) {
    return {
      title: `${overdueVehicle.name} requiere mantenimiento inmediato.`,
      reason: "El mantenimiento del vehículo se encuentra vencido.",
      priority: "CRITICAL",
    };
  }

  const upcomingVehicle = input.vehicles
    .filter(({ maintenanceStatus }) => maintenanceStatus === "UPCOMING")
    .sort((a, b) => a.remainingMaintenanceKm - b.remainingMaintenanceKm)[0];
  if (upcomingVehicle) {
    return {
      title: `${upcomingVehicle.name} requiere mantenimiento en ${upcomingVehicle.remainingMaintenanceKm.toLocaleString("es-CL")} km.`,
      reason: "Programarlo ahora evita afectar una futura ruta operacional.",
      priority: "WARNING",
    };
  }

  const availableCapacity = Math.min(
    input.blackBoxes.filter(({ status }) => status === "AVAILABLE").length,
    input.booths.filter(({ status }) => status === "AVAILABLE").length,
    input.vehicles.filter(({ status }) => status === "AVAILABLE").length,
    input.operators.filter(({ status }) => status === "AVAILABLE").length,
  );

  return {
    title: `Capacidad disponible para ${availableCapacity} evento${availableCapacity === 1 ? "" : "s"} adicional${availableCapacity === 1 ? "" : "es"}.`,
    reason: "Los recursos críticos se encuentran disponibles y saludables.",
    priority: "INFO",
  };
}

export function createOperationsBoardSnapshot(input: OperationsBoardInput): OperationsBoardSnapshot {
  const boxes = countStatuses(input.blackBoxes);
  const booths = countStatuses(input.booths);
  const availableVehicles = input.vehicles.filter(({ status }) => status === "AVAILABLE").length;
  const availableOperators = input.operators.filter(({ status }) => status === "AVAILABLE").length;
  const potentialAdditionalEvents = Math.min(boxes.available, booths.available, availableVehicles, availableOperators);
  const allMaintainedAssets = [...input.blackBoxes, ...input.booths, ...input.vehicles];

  return {
    ...input,
    dailyCapacity: {
      boxes,
      booths,
      availableVehicles,
      availableOperators,
      operationalCapacityPercentage: input.capacityIndicators[0]?.percentage ?? 0,
      potentialAdditionalEvents,
    },
    health: {
      healthyAssets: countMaintenance(allMaintainedAssets, "HEALTHY"),
      upcomingMaintenance: countMaintenance(allMaintainedAssets, "UPCOMING"),
      overdueMaintenance: countMaintenance(allMaintainedAssets, "OVERDUE"),
      vehicleAlerts: input.vehicles.filter(({ maintenanceStatus }) => maintenanceStatus !== "HEALTHY").length,
    },
    recommendation: selectRecommendation(input),
  };
}

export function getCommandCenterOperationalIndicators(
  snapshot: OperationsBoardSnapshot,
): CommandCenterOperationalIndicators {
  return {
    operationalCapacityPercentage: snapshot.dailyCapacity.operationalCapacityPercentage,
    potentialAdditionalEvents: snapshot.dailyCapacity.potentialAdditionalEvents,
    activeAlerts: snapshot.alerts.length,
    upcomingMaintenance: snapshot.health.upcomingMaintenance,
  };
}

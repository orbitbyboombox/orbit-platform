import { ProjectState } from "@/features/projects/engine";
import { OPERATIONAL_VEHICLE_BY_ID } from "../data";
import {
  DEFAULT_OPERATIONAL_RULES,
  VEHICLE_MAINTENANCE_UPCOMING_THRESHOLD_KM,
} from "../rules";
import type {
  EquipmentReuseEvaluation,
  EquipmentReuseRejectionReason,
  EventOperationalPlan,
  OperationalEvent,
  OperationalRecommendation,
  OperationalTime,
  OperationalWindowConfig,
  OperationsIntelligenceInput,
  OperationsIntelligenceResult,
  VehicleHealth,
  VehicleOdometerInput,
} from "../types";

const MINUTES_PER_DAY = 1_440;
const PRIORITY_WEIGHT = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

export function analyzeOperations(input: OperationsIntelligenceInput): OperationsIntelligenceResult {
  const config = Object.freeze({ ...DEFAULT_OPERATIONAL_RULES, ...input.config });
  const events = input.events
    .filter((event) => event.projectState === ProjectState.CONFIRMED)
    .toSorted(compareEvents);
  const plans = events.map((event) => createEventOperationalPlan(event, config));
  const reuseEvaluations = events.slice(0, -1).map((event, index) =>
    evaluateEquipmentReuse(event, events[index + 1], config),
  );
  const vehicleHealth = input.vehicles.map(calculateVehicleHealth);
  const recommendations = createRecommendations(events, reuseEvaluations, vehicleHealth, config);

  return Object.freeze({
    plans: Object.freeze(plans),
    reuseEvaluations: Object.freeze(reuseEvaluations),
    vehicleHealth: Object.freeze(vehicleHealth),
    primaryRecommendation: selectPrimaryRecommendation(recommendations),
  });
}

export function createEventOperationalPlan(
  event: OperationalEvent,
  config: OperationalWindowConfig = DEFAULT_OPERATIONAL_RULES,
): EventOperationalPlan {
  const serviceEndTime = addMinutes(event.serviceStartTime, event.contractedHours * 60);
  return Object.freeze({
    eventId: event.id,
    reservedBlackBoxes: 1,
    reservedBooths: 1,
    reservedOperators: 1,
    operatorCallTime: addMinutes(event.serviceStartTime, -config.operatorCallLeadMinutes),
    serviceEndTime,
    mountingWindowMinutes: config.mountingMinutes,
    dismantlingWindowMinutes: config.dismantlingMinutes,
    routeOrigin: config.warehouseName,
    recommendWarehouseReturn: true,
  });
}

export function evaluateEquipmentReuse(
  source: OperationalEvent,
  target: OperationalEvent,
  config: OperationalWindowConfig = DEFAULT_OPERATIONAL_RULES,
): EquipmentReuseEvaluation {
  const sourceStart = absoluteEventMinutes(source);
  const sourceEnd = sourceStart + source.contractedHours * 60;
  const targetStart = absoluteEventMinutes(target);
  const travelMinutes = source.estimatedTravelMinutesToNextEvent ?? 0;
  const requiredMinutes = config.dismantlingMinutes + travelMinutes + config.mountingMinutes;
  const availableMinutes = targetStart - sourceEnd;
  const rejectionReasons: EquipmentReuseRejectionReason[] = [];

  if (parseTime(source.serviceStartTime) > parseTime(config.lateEventThreshold)) {
    rejectionReasons.push("LATE_EVENT");
  }
  if (!finishesWithinOperationalLimit(source, config.operationalLimitTime)) {
    rejectionReasons.push("OUTSIDE_OPERATIONAL_LIMIT");
  }
  if (source.geographicArea !== target.geographicArea) {
    rejectionReasons.push("INCOMPATIBLE_GEOGRAPHIC_AREA");
  }
  if (availableMinutes < requiredMinutes) {
    rejectionReasons.push("INSUFFICIENT_OPERATIONAL_WINDOW");
  }
  if (source.operationalRisk !== "LOW" || target.operationalRisk !== "LOW") {
    rejectionReasons.push("OPERATIONAL_RISK");
  }

  return Object.freeze({
    sourceEventId: source.id,
    targetEventId: target.id,
    recommended: rejectionReasons.length === 0,
    availableMinutes,
    requiredMinutes,
    rejectionReasons: Object.freeze(rejectionReasons),
  });
}

export function calculateVehicleHealth(input: VehicleOdometerInput): VehicleHealth {
  const vehicle = OPERATIONAL_VEHICLE_BY_ID[input.vehicleId];
  const nextMaintenanceKm = input.lastMaintenanceKm + vehicle.maintenanceIntervalKm;
  const remainingKm = nextMaintenanceKm - input.currentKm;
  const maintenanceStatus =
    remainingKm < 0
      ? "OVERDUE"
      : remainingKm <= VEHICLE_MAINTENANCE_UPCOMING_THRESHOLD_KM
        ? "UPCOMING"
        : "NORMAL";

  return Object.freeze({
    vehicle,
    currentKm: input.currentKm,
    nextMaintenanceKm,
    remainingKm,
    maintenanceStatus,
  });
}

export function addMinutes(time: string, minutes: number): OperationalTime {
  const total = parseTime(time) + minutes;
  const dayOffset = Math.floor(total / MINUTES_PER_DAY);
  const normalized = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60).toString().padStart(2, "0");
  const minute = (normalized % 60).toString().padStart(2, "0");
  return Object.freeze({ time: `${hours}:${minute}`, dayOffset });
}

function createRecommendations(
  events: readonly OperationalEvent[],
  reuseEvaluations: readonly EquipmentReuseEvaluation[],
  vehicleHealth: readonly VehicleHealth[],
  config: OperationalWindowConfig,
): readonly OperationalRecommendation[] {
  const recommendations: OperationalRecommendation[] = [];

  for (const event of events) {
    if (!event.operatorId || !event.boothId || !event.blackBoxId) {
      const missing = [
        !event.operatorId && "operador",
        !event.boothId && "cabina",
        !event.blackBoxId && "Black Box",
      ].filter(Boolean).join(", ");
      recommendations.push({
        id: `complete-resources:${event.id}`,
        title: !event.operatorId ? "Asignar operador" : "Completar recursos operacionales",
        reason: `El evento no tiene ${missing} asignado.`,
        impact: "La preparación operacional no puede considerarse completa.",
        actionLabel: !event.operatorId ? "Asignar operador" : "Asignar recursos",
        estimatedTime: "30 segundos",
        priority: "CRITICAL",
        eventId: event.id,
        vehicleId: null,
      });
    }
  }

  for (const health of vehicleHealth) {
    if (health.maintenanceStatus !== "NORMAL") {
      const overdue = health.maintenanceStatus === "OVERDUE";
      recommendations.push({
        id: `vehicle-maintenance:${health.vehicle.id}`,
        title: overdue ? "Programar mantenimiento vencido" : "Preparar mantenimiento vehicular",
        reason: overdue
          ? `${health.vehicle.name} superó su mantenimiento por ${Math.abs(health.remainingKm).toLocaleString("es-CL")} km.`
          : `El mantenimiento de ${health.vehicle.name} vence en ${health.remainingKm.toLocaleString("es-CL")} km.`,
        impact: "Anticipar la revisión reduce el riesgo de indisponibilidad operacional.",
        actionLabel: "Revisar vehículo",
        estimatedTime: "2 minutos",
        priority: overdue ? "CRITICAL" : "HIGH",
        eventId: null,
        vehicleId: health.vehicle.id,
      });
    }
  }

  for (const evaluation of reuseEvaluations) {
    if (evaluation.recommended) {
      recommendations.push({
        id: `reuse-equipment:${evaluation.sourceEventId}:${evaluation.targetEventId}`,
        title: "Reutilizar equipamiento de forma segura",
        reason: "Los eventos comparten zona, tienen bajo riesgo y cuentan con ventana operacional suficiente.",
        impact: "Una cabina y un Black Box pueden cubrir un segundo evento sin comprometer la operación.",
        actionLabel: "Revisar propuesta",
        estimatedTime: "1 minuto",
        priority: "MEDIUM",
        eventId: evaluation.sourceEventId,
        vehicleId: null,
      });
    }
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "return-to-warehouse",
      title: `Planificar retorno a ${config.warehouseName}`,
      reason: "No existe una regla operacional de mayor eficiencia para reutilizar equipamiento.",
      impact: "El retorno mantiene vehículos y equipos preparados para la siguiente jornada.",
      actionLabel: "Revisar retorno",
      estimatedTime: "1 minuto",
      priority: "LOW",
      eventId: events[0]?.id ?? null,
      vehicleId: null,
    });
  }

  return recommendations;
}

function selectPrimaryRecommendation(
  recommendations: readonly OperationalRecommendation[],
): OperationalRecommendation {
  return recommendations.toSorted(
    (left, right) => PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority],
  )[0];
}

function finishesWithinOperationalLimit(event: OperationalEvent, limitTime: string): boolean {
  const start = parseTime(event.serviceStartTime);
  const end = start + event.contractedHours * 60;
  const parsedLimit = parseTime(limitTime);
  const absoluteLimit = parsedLimit <= start ? parsedLimit + MINUTES_PER_DAY : parsedLimit;
  return end <= absoluteLimit;
}

function absoluteEventMinutes(event: OperationalEvent): number {
  const [year, month, day] = event.eventDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000) * MINUTES_PER_DAY + parseTime(event.serviceStartTime);
}

function compareEvents(left: OperationalEvent, right: OperationalEvent): number {
  return absoluteEventMinutes(left) - absoluteEventMinutes(right);
}

function parseTime(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error(`Invalid operational time: ${time}`);
  }
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

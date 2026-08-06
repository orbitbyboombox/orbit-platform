import { ProjectState } from "@/features/projects/engine";
import {
  addMinutes,
  analyzeOperations,
  createEventOperationalPlan,
  DEFAULT_OPERATIONAL_RULES,
  evaluateEquipmentReuse,
  OPERATIONAL_VEHICLE_BY_ID,
} from "@/features/operations-intelligence";
import type {
  DailyOperationalPlan,
  DailyOperationsPlannerInput,
  DailyPlanRecommendation,
  DailyPlanningProject,
  OperationalPlanningAlert,
  OperationalRouteDirection,
  OperationalSequenceItem,
  PlannedEvent,
  PlannerEquipment,
  PlannerOperator,
  ProposedOperationalRoute,
} from "../types";

const ROUTE_ORDER: readonly OperationalRouteDirection[] = ["NORTH", "SOUTH", "EAST", "WEST"];

interface ResourceCursor {
  operator: number;
  blackBox: number;
  booth: number;
  vehicle: number;
}

export function generateDailyOperationalPlan(input: DailyOperationsPlannerInput): DailyOperationalPlan {
  const confirmedProjects = input.projects.filter(
    (project) =>
      project.operationalEvent.projectState === ProjectState.CONFIRMED &&
      project.operationalEvent.eventDate === input.planningDate,
  );
  const availableOperators = input.operators.filter((operator) => operator.available);
  const availableBlackBoxes = input.blackBoxes.filter((equipment) => equipment.available);
  const availableBooths = input.booths.filter((equipment) => equipment.available);
  const availableVehicles = input.vehicleOdometers.map(
    (odometer) => OPERATIONAL_VEHICLE_BY_ID[odometer.vehicleId],
  );
  const cursor: ResourceCursor = { operator: 0, blackBox: 0, booth: 0, vehicle: 0 };
  const alerts: OperationalPlanningAlert[] = [];
  const recommendations: DailyPlanRecommendation[] = [];

  const routes = ROUTE_ORDER.flatMap((direction) => {
    const projects = confirmedProjects
      .filter((project) => project.routeDirection === direction)
      .toSorted(compareProjects);
    if (!projects.length) return [];

    const route = createRoute(
      direction,
      projects,
      availableOperators,
      availableBlackBoxes,
      availableBooths,
      availableVehicles,
      cursor,
      alerts,
      recommendations,
    );
    return [route];
  });

  appendVehicleRecommendations(input, recommendations);

  return Object.freeze({
    id: `daily-plan:${input.planningDate}`,
    planningDate: input.planningDate,
    status: "DRAFT",
    requiresBoomboxApproval: true,
    routes: Object.freeze(routes),
    recommendations: Object.freeze(recommendations),
    alerts: Object.freeze(alerts),
  });
}

function createRoute(
  direction: OperationalRouteDirection,
  projects: readonly DailyPlanningProject[],
  availableOperators: readonly PlannerOperator[],
  availableBlackBoxes: readonly PlannerEquipment[],
  availableBooths: readonly PlannerEquipment[],
  availableVehicles: readonly (typeof OPERATIONAL_VEHICLE_BY_ID)[keyof typeof OPERATIONAL_VEHICLE_BY_ID][],
  cursor: ResourceCursor,
  alerts: OperationalPlanningAlert[],
  recommendations: DailyPlanRecommendation[],
): ProposedOperationalRoute {
  const reuseEvaluations = projects.slice(0, -1).map((project, index) =>
    evaluateEquipmentReuse(project.operationalEvent, projects[index + 1].operationalEvent),
  );
  const reusableTransitions = reuseEvaluations.filter((evaluation) => evaluation.recommended).length;
  const equipmentCount = Math.max(1, projects.length - reusableTransitions);
  const operators = takeResources(availableOperators, cursor.operator, projects.length);
  const blackBoxes = takeResources(availableBlackBoxes, cursor.blackBox, equipmentCount);
  const booths = takeResources(availableBooths, cursor.booth, equipmentCount);
  const vehicle = availableVehicles[cursor.vehicle] ?? null;

  appendResourceAlerts(direction, projects, operators, blackBoxes, booths, vehicle, alerts);
  appendRiskAlerts(direction, projects, alerts);
  appendReuseRecommendations(direction, projects, reuseEvaluations, recommendations);
  appendRouteRecommendation(direction, projects, recommendations);

  cursor.operator += projects.length;
  cursor.blackBox += equipmentCount;
  cursor.booth += equipmentCount;
  cursor.vehicle += 1;

  const first = projects[0];
  const last = projects.at(-1) ?? first;
  const departureTime = addMinutes(
    first.operationalEvent.serviceStartTime,
    -DEFAULT_OPERATIONAL_RULES.operatorCallLeadMinutes - first.estimatedTravelMinutesFromWarehouse,
  );
  const estimatedReturnTime = addMinutes(
    last.operationalEvent.serviceStartTime,
    last.operationalEvent.contractedHours * 60 +
      DEFAULT_OPERATIONAL_RULES.dismantlingMinutes +
      last.estimatedTravelMinutesFromWarehouse,
  );
  const events = projects.map(createPlannedEvent);

  return Object.freeze({
    id: `route:${direction.toLocaleLowerCase("en-US")}`,
    direction,
    vehicle,
    operators: Object.freeze(operators),
    blackBoxes: Object.freeze(blackBoxes),
    booths: Object.freeze(booths),
    departureTime,
    estimatedReturnTime,
    events: Object.freeze(events),
    sequence: Object.freeze(createSequence(projects)),
    projectedDistanceSavingsKm: projects.reduce(
      (total, project) => total + project.projectedDistanceSavingsKm,
      0,
    ),
  });
}

function createPlannedEvent(project: DailyPlanningProject): PlannedEvent {
  const plan = createEventOperationalPlan(project.operationalEvent);
  return Object.freeze({
    project,
    serviceEndTime: plan.serviceEndTime,
    operatorCallTime: plan.operatorCallTime,
    mountingWindowMinutes: plan.mountingWindowMinutes,
    dismantlingWindowMinutes: plan.dismantlingWindowMinutes,
  });
}

function createSequence(projects: readonly DailyPlanningProject[]): readonly OperationalSequenceItem[] {
  return projects.flatMap((project) => {
    const event = project.operationalEvent;
    const serviceEnd = addMinutes(event.serviceStartTime, event.contractedHours * 60);
    const dismantlingEnd = addOperationalMinutes(
      serviceEnd,
      DEFAULT_OPERATIONAL_RULES.dismantlingMinutes,
    );
    return [
      {
        id: `${event.id}:mounting`,
        eventId: event.id,
        type: "MOUNTING" as const,
        title: `Montaje · ${project.customer}`,
        location: event.location,
        start: addMinutes(event.serviceStartTime, -DEFAULT_OPERATIONAL_RULES.mountingMinutes),
        end: addMinutes(event.serviceStartTime, 0),
      },
      {
        id: `${event.id}:service`,
        eventId: event.id,
        type: "SERVICE" as const,
        title: `Servicio · ${project.customer}`,
        location: event.location,
        start: addMinutes(event.serviceStartTime, 0),
        end: serviceEnd,
      },
      {
        id: `${event.id}:dismantling`,
        eventId: event.id,
        type: "DISMANTLING" as const,
        title: `Desmontaje · ${project.customer}`,
        location: event.location,
        start: serviceEnd,
        end: dismantlingEnd,
      },
    ];
  }).toSorted((left, right) => timeWeight(left.start) - timeWeight(right.start));
}

function appendResourceAlerts(
  direction: OperationalRouteDirection,
  projects: readonly DailyPlanningProject[],
  operators: readonly PlannerOperator[],
  blackBoxes: readonly PlannerEquipment[],
  booths: readonly PlannerEquipment[],
  vehicle: ProposedOperationalRoute["vehicle"],
  alerts: OperationalPlanningAlert[],
) {
  const expectedEquipment = Math.max(1, projects.length - countReusableTransitions(projects));
  if (!vehicle) alerts.push(createAlert("VEHICLE_CONFLICT", direction, null, "No existe un vehículo disponible para esta ruta."));
  if (operators.length < projects.length) alerts.push(createAlert("OPERATOR_CONFLICT", direction, null, "No existen operadores suficientes para todos los eventos de la ruta."));
  if (blackBoxes.length < expectedEquipment) alerts.push(createAlert("BLACK_BOX_CONFLICT", direction, null, "No existen Black Boxes suficientes para la propuesta."));
  if (booths.length < expectedEquipment) alerts.push(createAlert("BOOTH_CONFLICT", direction, null, "No existen cabinas suficientes para la propuesta."));
}

function appendRiskAlerts(
  direction: OperationalRouteDirection,
  projects: readonly DailyPlanningProject[],
  alerts: OperationalPlanningAlert[],
) {
  projects
    .filter((project) => ["HIGH", "CRITICAL"].includes(project.operationalEvent.operationalRisk))
    .forEach((project) => alerts.push(createAlert(
      "OPERATIONAL_RISK",
      direction,
      project.operationalEvent.id,
      `${project.customer} requiere revisión de riesgo operacional.`,
      "WARNING",
    )));
}

function appendReuseRecommendations(
  direction: OperationalRouteDirection,
  projects: readonly DailyPlanningProject[],
  evaluations: ReturnType<typeof evaluateEquipmentReuse>[],
  recommendations: DailyPlanRecommendation[],
) {
  evaluations.forEach((evaluation, index) => {
    if (!evaluation.recommended) return;
    recommendations.push({
      id: `reuse:${evaluation.sourceEventId}:${evaluation.targetEventId}`,
      title: `Reutilizar equipamiento en Ruta ${routeLabel(direction)}`,
      reason: `${projects[index].customer} termina con ventana suficiente antes de ${projects[index + 1].customer}.`,
      priority: "HIGH",
    });
  });
}

function appendRouteRecommendation(
  direction: OperationalRouteDirection,
  projects: readonly DailyPlanningProject[],
  recommendations: DailyPlanRecommendation[],
) {
  const savings = projects.reduce((total, project) => total + project.projectedDistanceSavingsKm, 0);
  if (savings > 0) recommendations.push({
    id: `route-savings:${direction}`,
    title: `Ruta ${routeLabel(direction)} ahorra ${savings} km`,
    reason: "Mantener la secuencia propuesta evita retornos innecesarios a Chicureo.",
    priority: "MEDIUM",
  });
}

function appendVehicleRecommendations(
  input: DailyOperationsPlannerInput,
  recommendations: DailyPlanRecommendation[],
) {
  const intelligence = analyzeOperations({ events: [], vehicles: input.vehicleOdometers });
  intelligence.vehicleHealth
    .filter((health) => health.maintenanceStatus !== "NORMAL")
    .forEach((health) => recommendations.push({
      id: `maintenance:${health.vehicle.id}`,
      title: `Mantenimiento de ${health.vehicle.name} próximo`,
      reason: `Restan ${health.remainingKm.toLocaleString("es-CL")} km para su próxima mantención.`,
      priority: "HIGH",
    }));
}

function countReusableTransitions(projects: readonly DailyPlanningProject[]): number {
  return projects.slice(0, -1).filter((project, index) =>
    evaluateEquipmentReuse(project.operationalEvent, projects[index + 1].operationalEvent).recommended,
  ).length;
}

function createAlert(
  type: OperationalPlanningAlert["type"],
  direction: OperationalRouteDirection,
  eventId: string | null,
  message: string,
  severity: OperationalPlanningAlert["severity"] = "CRITICAL",
): OperationalPlanningAlert {
  return Object.freeze({
    id: `${type}:${direction}:${eventId ?? "route"}`,
    type,
    severity,
    routeDirection: direction,
    eventId,
    message,
  });
}

function takeResources<T>(resources: readonly T[], start: number, count: number): readonly T[] {
  return resources.slice(start, start + count);
}

function compareProjects(left: DailyPlanningProject, right: DailyPlanningProject): number {
  return timeWeight({ time: left.operationalEvent.serviceStartTime, dayOffset: 0 }) -
    timeWeight({ time: right.operationalEvent.serviceStartTime, dayOffset: 0 });
}

function timeWeight(time: { time: string; dayOffset: number }): number {
  const [hours, minutes] = time.time.split(":").map(Number);
  return time.dayOffset * 1_440 + hours * 60 + minutes;
}

function addOperationalMinutes(time: { time: string; dayOffset: number }, minutes: number) {
  const result = addMinutes(time.time, minutes);
  return Object.freeze({ time: result.time, dayOffset: time.dayOffset + result.dayOffset });
}

function routeLabel(direction: OperationalRouteDirection): string {
  return { NORTH: "Norte", SOUTH: "Sur", EAST: "Oriente", WEST: "Poniente" }[direction];
}

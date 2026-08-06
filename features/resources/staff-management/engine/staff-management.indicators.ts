import type {
  StaffManagementInput,
  StaffManagementSnapshot,
  StaffRecommendation,
} from "../types/staff-management.types";

function selectStaffRecommendation(input: StaffManagementInput): StaffRecommendation {
  const overloadedMember = input.members.find(({ history, today }) => today && history.currentAssignments > 1);
  if (overloadedMember) {
    return {
      title: `${overloadedMember.profile.firstName} supera la carga diaria recomendada.`,
      reason: "Tiene más de una asignación activa y requiere revisión de BOOMBOX.",
      priority: "WARNING",
    };
  }

  const availableDriver = input.members.find(
    ({ employment, profile }) => profile.status === "ACTIVE" && employment.capabilities.includes("OPERATOR") && employment.canDriveCompanyVehicle,
  );
  if (availableDriver) {
    return {
      title: `${availableDriver.profile.firstName} está disponible para una segunda operación.`,
      reason: "Tiene disponibilidad y autorización para conducir un vehículo de la empresa.",
      priority: "INFO",
    };
  }

  return {
    title: "Revisar capacidad del equipo antes de confirmar nuevas operaciones.",
    reason: "No existen colaboradores disponibles para una asignación adicional.",
    priority: "CRITICAL",
  };
}

export function createStaffManagementSnapshot(input: StaffManagementInput): StaffManagementSnapshot {
  const availableStaff = input.members.filter(({ profile }) => profile.status === "ACTIVE").length;
  const assignedStaff = input.members.filter(({ history }) => history.currentAssignments > 0).length;
  const activeAlerts = input.members.filter(
    ({ history, profile }) => history.lateArrivals > 0 || history.currentAssignments > 1 || profile.status !== "ACTIVE",
  ).length;

  return {
    ...input,
    indicators: {
      totalStaff: input.members.length,
      availableStaff,
      assignedStaff,
      capacityPercentage: input.members.length === 0 ? 0 : Math.round((assignedStaff / input.members.length) * 100),
      activeAlerts,
    },
    recommendation: selectStaffRecommendation(input),
  };
}

import { ProjectHealth, ProjectStatus, ProjectType } from "./project.enums";

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  [ProjectStatus.LEAD]: "Lead",
  [ProjectStatus.INFORMATION_SENT]: "Information Sent",
  [ProjectStatus.RESERVATION_READY]: "Reservation Ready",
  [ProjectStatus.CONTRACT_PENDING]: "Contract Pending",
  [ProjectStatus.WAITING_DEPOSIT]: "Waiting Deposit",
  [ProjectStatus.CONFIRMED]: "Confirmed",
  [ProjectStatus.PRODUCTION]: "Production",
  [ProjectStatus.EVENT]: "Event",
  [ProjectStatus.DELIVERY]: "Delivery",
  [ProjectStatus.CLOSED]: "Closed",
  [ProjectStatus.ARCHIVED]: "Archived",
};

export const PROJECT_HEALTH_LABELS: Readonly<Record<ProjectHealth, string>> = {
  [ProjectHealth.HEALTHY]: "Healthy",
  [ProjectHealth.ATTENTION]: "Attention",
  [ProjectHealth.RISK]: "Risk",
  [ProjectHealth.CRITICAL]: "Critical",
};

export const PROJECT_TYPE_LABELS: Readonly<Record<ProjectType, string>> = {
  [ProjectType.WEDDING]: "Wedding",
  [ProjectType.CORPORATE]: "Corporate",
  [ProjectType.BIRTHDAY]: "Birthday",
  [ProjectType.PRIVATE]: "Private",
  [ProjectType.OTHER]: "Other",
};

export const PROJECT_TYPES: readonly ProjectType[] = Object.freeze(Object.values(ProjectType));
export const PROJECT_STATUSES: readonly ProjectStatus[] = Object.freeze(Object.values(ProjectStatus));
export const PROJECT_HEALTH_LEVELS: readonly ProjectHealth[] = Object.freeze(Object.values(ProjectHealth));

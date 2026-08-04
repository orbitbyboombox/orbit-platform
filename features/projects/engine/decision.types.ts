import type { MissionPriority, ProjectMission } from "./mission.types";
import type { ProjectState } from "./project-state";

export enum ProjectFinancialStatus {
  PENDING = "PENDING",
  PARTIAL = "PARTIAL",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  CLOSED = "CLOSED",
}

export enum RecommendedExperience {
  QUOTATION = "Quotation",
  RESERVATION = "Reservation",
  CONFIRMATION = "Confirmation",
  PREPARATION = "Preparation",
  LIVE_EVENT = "Live Event",
  DELIVERY = "Delivery",
  PROJECT_CLOSING = "Project Closing",
  FUTURE_OPPORTUNITY = "Future Opportunity",
}

export interface DecisionContext {
  state: ProjectState;
  currentMission: ProjectMission;
  preparationScore?: number;
  financialStatus?: ProjectFinancialStatus;
  daysUntilEvent?: number;
}

export interface ProjectDecision {
  title: string;
  reason: string;
  impact: string;
  estimatedTime: string;
  priority: MissionPriority;
  actionLabel: string;
  nextRecommendedExperience: RecommendedExperience;
}

export interface DecisionEngine {
  getDecision(context: DecisionContext): ProjectDecision;
}


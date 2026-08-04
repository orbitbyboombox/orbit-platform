import type { ProjectDecision } from "./decision.types";
import type { ProjectEvent, ProjectEventType } from "./project-events";
import type { ProjectState } from "./project-state";

export enum AutomationPriority {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum AutomationTarget {
  GOOGLE_CALENDAR = "GOOGLE_CALENDAR",
  GOOGLE_DRIVE = "GOOGLE_DRIVE",
  WHATSAPP = "WHATSAPP",
  EMAIL = "EMAIL",
}

export enum AutomationPayloadType {
  PROJECT_FOLDER = "PROJECT_FOLDER",
  CALENDAR_EVENT = "CALENDAR_EVENT",
  OPERATOR_NOTIFICATION = "OPERATOR_NOTIFICATION",
  GALLERY_DELIVERY = "GALLERY_DELIVERY",
  CUSTOMER_FOLLOW_UP = "CUSTOMER_FOLLOW_UP",
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  triggerEvent: ProjectEventType;
  priority: AutomationPriority;
  target: AutomationTarget;
  payloadType: AutomationPayloadType;
}

export interface AutomationEvaluationContext {
  event: ProjectEvent;
  currentState: ProjectState;
  currentDecision: ProjectDecision;
}

export interface AutomationRulesEngine {
  evaluate(context: AutomationEvaluationContext): AutomationRule[];
}


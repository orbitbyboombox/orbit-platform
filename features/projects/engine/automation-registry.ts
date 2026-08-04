import { ProjectEventType } from "./project-events";
import { ProjectState } from "./project-state";
import {
  AutomationPayloadType,
  AutomationPriority,
  AutomationTarget,
  type AutomationRule,
} from "./automation.types";

function defineAutomationRule(rule: AutomationRule): AutomationRule {
  return Object.freeze(rule);
}

export const AUTOMATION_REGISTRY: readonly AutomationRule[] = Object.freeze([
  defineAutomationRule({
    id: "create-project-drive-folder",
    name: "Create Google Drive Folder",
    description: "Prepare the standard project folder for reserved project assets.",
    triggerEvent: ProjectEventType.PROJECT_RESERVED,
    priority: AutomationPriority.HIGH,
    target: AutomationTarget.GOOGLE_DRIVE,
    payloadType: AutomationPayloadType.PROJECT_FOLDER,
  }),
  defineAutomationRule({
    id: "create-project-calendar-event",
    name: "Create Calendar Event",
    description: "Prepare the confirmed event for calendar synchronization.",
    triggerEvent: ProjectEventType.PROJECT_CONFIRMED,
    priority: AutomationPriority.HIGH,
    target: AutomationTarget.GOOGLE_CALENDAR,
    payloadType: AutomationPayloadType.CALENDAR_EVENT,
  }),
  defineAutomationRule({
    id: "notify-assigned-operator",
    name: "Notify Assigned Operator",
    description: "Prepare an operator notification when the project is ready for production.",
    triggerEvent: ProjectEventType.READY_FOR_PRODUCTION,
    priority: AutomationPriority.HIGH,
    target: AutomationTarget.WHATSAPP,
    payloadType: AutomationPayloadType.OPERATOR_NOTIFICATION,
  }),
  defineAutomationRule({
    id: "prepare-gallery-delivery",
    name: "Prepare Gallery Delivery",
    description: "Prepare the event assets for client gallery delivery.",
    triggerEvent: ProjectEventType.EVENT_FINISHED,
    priority: AutomationPriority.HIGH,
    target: AutomationTarget.GOOGLE_DRIVE,
    payloadType: AutomationPayloadType.GALLERY_DELIVERY,
  }),
  defineAutomationRule({
    id: "schedule-customer-follow-up",
    name: "Schedule Customer Follow-up",
    description: "Prepare the completed customer relationship for a future follow-up.",
    triggerEvent: ProjectEventType.DELIVERY_COMPLETED,
    priority: AutomationPriority.MEDIUM,
    target: AutomationTarget.GOOGLE_CALENDAR,
    payloadType: AutomationPayloadType.CUSTOMER_FOLLOW_UP,
  }),
]);

export const AUTOMATION_EVENT_STATE: Readonly<Partial<Record<ProjectEventType, ProjectState>>> = Object.freeze({
  [ProjectEventType.PROJECT_RESERVED]: ProjectState.RESERVED,
  [ProjectEventType.PROJECT_CONFIRMED]: ProjectState.CONFIRMED,
  [ProjectEventType.READY_FOR_PRODUCTION]: ProjectState.READY,
  [ProjectEventType.EVENT_FINISHED]: ProjectState.DELIVERY,
  [ProjectEventType.DELIVERY_COMPLETED]: ProjectState.ARCHIVED,
});


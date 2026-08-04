import { ProjectState } from "./project-state";

export enum ProjectEventType {
  PROJECT_CREATED = "PROJECT_CREATED",
  QUOTE_SENT = "QUOTE_SENT",
  PROJECT_RESERVED = "PROJECT_RESERVED",
  PROJECT_CONFIRMED = "PROJECT_CONFIRMED",
  PREPARATION_STARTED = "PREPARATION_STARTED",
  READY_FOR_PRODUCTION = "READY_FOR_PRODUCTION",
  EVENT_STARTED = "EVENT_STARTED",
  EVENT_FINISHED = "EVENT_FINISHED",
  DELIVERY_COMPLETED = "DELIVERY_COMPLETED",
  PROJECT_ARCHIVED = "PROJECT_ARCHIVED",
}

export interface ProjectEvent {
  projectId: string;
  type: ProjectEventType;
  previousState: ProjectState | null;
  state: ProjectState;
}

export function createProjectCreatedEvent(projectId: string): ProjectEvent {
  return {
    projectId,
    type: ProjectEventType.PROJECT_CREATED,
    previousState: null,
    state: ProjectState.LEAD,
  };
}

export function createProjectEvent(
  projectId: string,
  type: ProjectEventType,
  previousState: ProjectState,
  state: ProjectState,
): ProjectEvent {
  return { projectId, type, previousState, state };
}


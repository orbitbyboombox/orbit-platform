import { createProjectEvent, ProjectEventType, type ProjectEvent } from "./project-events";
import { PROJECT_STATE_SEQUENCE, ProjectState } from "./project-state";

export const PROJECT_TRANSITIONS: Readonly<Record<ProjectState, ProjectState | null>> = Object.freeze({
  [ProjectState.LEAD]: ProjectState.QUOTED,
  [ProjectState.QUOTED]: ProjectState.RESERVED,
  [ProjectState.RESERVED]: ProjectState.CONFIRMED,
  [ProjectState.CONFIRMED]: ProjectState.PREPARATION,
  [ProjectState.PREPARATION]: ProjectState.READY,
  [ProjectState.READY]: ProjectState.LIVE_EVENT,
  [ProjectState.LIVE_EVENT]: ProjectState.DELIVERY,
  [ProjectState.DELIVERY]: ProjectState.ARCHIVED,
  [ProjectState.ARCHIVED]: null,
});

const TRANSITION_EVENT: Readonly<Partial<Record<ProjectState, ProjectEventType>>> = Object.freeze({
  [ProjectState.QUOTED]: ProjectEventType.QUOTE_SENT,
  [ProjectState.RESERVED]: ProjectEventType.PROJECT_RESERVED,
  [ProjectState.CONFIRMED]: ProjectEventType.PROJECT_CONFIRMED,
  [ProjectState.PREPARATION]: ProjectEventType.PREPARATION_STARTED,
  [ProjectState.READY]: ProjectEventType.READY_FOR_PRODUCTION,
  [ProjectState.LIVE_EVENT]: ProjectEventType.EVENT_STARTED,
  [ProjectState.DELIVERY]: ProjectEventType.EVENT_FINISHED,
  [ProjectState.ARCHIVED]: ProjectEventType.PROJECT_ARCHIVED,
});

export function canProjectTransition(currentState: ProjectState, targetState: ProjectState): boolean {
  return PROJECT_TRANSITIONS[currentState] === targetState;
}

export function getProjectNextState(currentState: ProjectState): ProjectState | null {
  return PROJECT_TRANSITIONS[currentState];
}

export function createTransitionEvents(
  projectId: string,
  currentState: ProjectState,
  targetState: ProjectState,
): readonly ProjectEvent[] {
  const transitionEvent = TRANSITION_EVENT[targetState];
  if (!transitionEvent) return [];

  if (currentState === ProjectState.DELIVERY && targetState === ProjectState.ARCHIVED) {
    return Object.freeze([
      createProjectEvent(projectId, ProjectEventType.DELIVERY_COMPLETED, currentState, targetState),
      createProjectEvent(projectId, transitionEvent, currentState, targetState),
    ]);
  }

  return Object.freeze([createProjectEvent(projectId, transitionEvent, currentState, targetState)]);
}

export function isProjectState(value: unknown): value is ProjectState {
  return PROJECT_STATE_SEQUENCE.includes(value as ProjectState);
}


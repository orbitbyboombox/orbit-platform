import type { ProjectEvent } from "./project-events";
import type { ProjectState } from "./project-state";

export interface ProjectStateSnapshot {
  projectId: string;
  state: ProjectState;
}

export interface ProjectTransitionInput extends ProjectStateSnapshot {
  targetState: ProjectState;
}

export enum ProjectTransitionErrorCode {
  INVALID_TRANSITION = "INVALID_TRANSITION",
  SAME_STATE_TRANSITION = "SAME_STATE_TRANSITION",
  PROJECT_ALREADY_ARCHIVED = "PROJECT_ALREADY_ARCHIVED",
}

export interface ProjectTransitionError {
  code: ProjectTransitionErrorCode;
  currentState: ProjectState;
  message: string;
  targetState: ProjectState;
}

export interface ProjectTransitionSuccess {
  success: true;
  previousState: ProjectState;
  state: ProjectState;
  events: readonly ProjectEvent[];
}

export interface ProjectTransitionFailure {
  success: false;
  error: ProjectTransitionError;
}

export type ProjectTransitionResult = ProjectTransitionSuccess | ProjectTransitionFailure;

export interface ProjectStateMachine {
  canTransition(currentState: ProjectState, targetState: ProjectState): boolean;
  transition(input: ProjectTransitionInput): ProjectTransitionResult;
  getCurrentState(snapshot: ProjectStateSnapshot): ProjectState;
  getNextState(currentState: ProjectState): ProjectState | null;
}


import { ProjectState } from "./project-state";
import {
  ProjectTransitionErrorCode,
  type ProjectStateMachine,
  type ProjectStateSnapshot,
  type ProjectTransitionInput,
  type ProjectTransitionResult,
} from "./project-state.types";
import {
  canProjectTransition,
  createTransitionEvents,
  getProjectNextState,
} from "./project-transition";

export function canTransition(currentState: ProjectState, targetState: ProjectState): boolean {
  return canProjectTransition(currentState, targetState);
}

export function getCurrentState(snapshot: ProjectStateSnapshot): ProjectState {
  return snapshot.state;
}

export function getNextState(currentState: ProjectState): ProjectState | null {
  return getProjectNextState(currentState);
}

export function transition(input: ProjectTransitionInput): ProjectTransitionResult {
  const { projectId, state: currentState, targetState } = input;

  if (currentState === targetState) {
    return {
      success: false,
      error: {
        code: ProjectTransitionErrorCode.SAME_STATE_TRANSITION,
        currentState,
        targetState,
        message: `Project is already in state ${currentState}.`,
      },
    };
  }

  if (currentState === ProjectState.ARCHIVED) {
    return {
      success: false,
      error: {
        code: ProjectTransitionErrorCode.PROJECT_ALREADY_ARCHIVED,
        currentState,
        targetState,
        message: "Archived projects cannot transition to another state.",
      },
    };
  }

  if (!canTransition(currentState, targetState)) {
    return {
      success: false,
      error: {
        code: ProjectTransitionErrorCode.INVALID_TRANSITION,
        currentState,
        targetState,
        message: `Cannot transition project from ${currentState} to ${targetState}.`,
      },
    };
  }

  return {
    success: true,
    previousState: currentState,
    state: targetState,
    events: createTransitionEvents(projectId, currentState, targetState),
  };
}

export const projectStateMachine: ProjectStateMachine = Object.freeze({
  canTransition,
  transition,
  getCurrentState,
  getNextState,
});


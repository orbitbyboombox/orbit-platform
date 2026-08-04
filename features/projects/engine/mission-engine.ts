import {
  MissionId,
  MissionPriority,
  type MissionEngine,
  type ProjectMission,
} from "./mission.types";
import { PROJECT_STATE_SEQUENCE, ProjectState } from "./project-state";

function defineMission(mission: ProjectMission): ProjectMission {
  return Object.freeze(mission);
}

export const PROJECT_MISSIONS: Readonly<Record<ProjectState, ProjectMission>> = Object.freeze({
  [ProjectState.LEAD]: defineMission({
    id: MissionId.SEND_QUOTE,
    title: "Send Quote",
    description: "Prepare and send the project quotation to the client.",
    reason: "The client needs a quotation before the project can be reserved.",
    estimatedTime: "2 minutes",
    priority: MissionPriority.HIGH,
    nextState: ProjectState.QUOTED,
  }),
  [ProjectState.QUOTED]: defineMission({
    id: MissionId.RESERVE_PROJECT,
    title: "Reserve Project",
    description: "Prepare the quoted project for reservation.",
    reason: "The quotation is ready and the project is awaiting reservation.",
    estimatedTime: "1 minute",
    priority: MissionPriority.HIGH,
    nextState: ProjectState.RESERVED,
  }),
  [ProjectState.RESERVED]: defineMission({
    id: MissionId.CONFIRM_RESERVATION,
    title: "Confirm Reservation",
    description: "Complete the reservation confirmation.",
    reason: "The reserved project must be confirmed before preparation begins.",
    estimatedTime: "1 minute",
    priority: MissionPriority.HIGH,
    nextState: ProjectState.CONFIRMED,
  }),
  [ProjectState.CONFIRMED]: defineMission({
    id: MissionId.ASSIGN_OPERATOR,
    title: "Assign Operator",
    description: "Assign the operator responsible for event production.",
    reason: "Preparation cannot proceed without an assigned operator.",
    estimatedTime: "30 seconds",
    priority: MissionPriority.HIGH,
    nextState: ProjectState.PREPARATION,
  }),
  [ProjectState.PREPARATION]: defineMission({
    id: MissionId.COMPLETE_PREPARATION_CHECKLIST,
    title: "Complete Preparation Checklist",
    description: "Complete every required production preparation item.",
    reason: "The project must pass preparation before it is ready for production.",
    estimatedTime: "5 minutes",
    priority: MissionPriority.HIGH,
    nextState: ProjectState.READY,
  }),
  [ProjectState.READY]: defineMission({
    id: MissionId.START_EVENT,
    title: "Start Event",
    description: "Start the live production session.",
    reason: "Preparation is complete and the project is ready for execution.",
    estimatedTime: "10 seconds",
    priority: MissionPriority.HIGH,
    nextState: ProjectState.LIVE_EVENT,
  }),
  [ProjectState.LIVE_EVENT]: defineMission({
    id: MissionId.FINISH_EVENT,
    title: "Finish Event",
    description: "Complete the active event production session.",
    reason: "The live event must finish before delivery can begin.",
    estimatedTime: "20 seconds",
    priority: MissionPriority.HIGH,
    nextState: ProjectState.DELIVERY,
  }),
  [ProjectState.DELIVERY]: defineMission({
    id: MissionId.SEND_GALLERY,
    title: "Send Gallery",
    description: "Deliver the completed gallery to the client.",
    reason: "Client delivery must be completed before the project is archived.",
    estimatedTime: "30 seconds",
    priority: MissionPriority.MEDIUM,
    nextState: ProjectState.ARCHIVED,
  }),
  [ProjectState.ARCHIVED]: defineMission({
    id: MissionId.CREATE_FOLLOW_UP_OPPORTUNITY,
    title: "Create Follow-up Opportunity",
    description: "Create a future opportunity from the completed client relationship.",
    reason: "The archived project can generate future business without reopening its lifecycle.",
    estimatedTime: "1 minute",
    priority: MissionPriority.LOW,
    nextState: null,
  }),
});

const MISSION_STATE_BY_ID: Readonly<Record<MissionId, ProjectState>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PROJECT_MISSIONS).map(([state, mission]) => [mission.id, state]),
  ) as Record<MissionId, ProjectState>,
);

export function getMissionByState(state: ProjectState): ProjectMission {
  return PROJECT_MISSIONS[state];
}

export function getCurrentMission(currentState: ProjectState): ProjectMission {
  return getMissionByState(currentState);
}

export function isMissionCompleted(missionId: MissionId, currentState: ProjectState): boolean {
  const missionState = MISSION_STATE_BY_ID[missionId];
  const missionIndex = PROJECT_STATE_SEQUENCE.indexOf(missionState);
  const currentStateIndex = PROJECT_STATE_SEQUENCE.indexOf(currentState);

  return currentStateIndex > missionIndex;
}

export const missionEngine: MissionEngine = Object.freeze({
  getCurrentMission,
  getMissionByState,
  isMissionCompleted,
});


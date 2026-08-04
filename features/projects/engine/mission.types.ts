import type { ProjectState } from "./project-state";

export enum MissionId {
  SEND_QUOTE = "send-quote",
  RESERVE_PROJECT = "reserve-project",
  CONFIRM_RESERVATION = "confirm-reservation",
  ASSIGN_OPERATOR = "assign-operator",
  COMPLETE_PREPARATION_CHECKLIST = "complete-preparation-checklist",
  START_EVENT = "start-event",
  FINISH_EVENT = "finish-event",
  SEND_GALLERY = "send-gallery",
  CREATE_FOLLOW_UP_OPPORTUNITY = "create-follow-up-opportunity",
}

export enum MissionPriority {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export interface ProjectMission {
  id: MissionId;
  title: string;
  description: string;
  reason: string;
  estimatedTime: string;
  priority: MissionPriority;
  nextState: ProjectState | null;
}

export interface MissionEngine {
  getCurrentMission(currentState: ProjectState): ProjectMission;
  getMissionByState(state: ProjectState): ProjectMission;
  isMissionCompleted(missionId: MissionId, currentState: ProjectState): boolean;
}


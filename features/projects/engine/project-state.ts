export enum ProjectState {
  LEAD = "LEAD",
  QUOTED = "QUOTED",
  RESERVED = "RESERVED",
  CONFIRMED = "CONFIRMED",
  PREPARATION = "PREPARATION",
  READY = "READY",
  LIVE_EVENT = "LIVE_EVENT",
  DELIVERY = "DELIVERY",
  ARCHIVED = "ARCHIVED",
}

export const PROJECT_STATE_SEQUENCE = [
  ProjectState.LEAD,
  ProjectState.QUOTED,
  ProjectState.RESERVED,
  ProjectState.CONFIRMED,
  ProjectState.PREPARATION,
  ProjectState.READY,
  ProjectState.LIVE_EVENT,
  ProjectState.DELIVERY,
  ProjectState.ARCHIVED,
] as const satisfies readonly ProjectState[];


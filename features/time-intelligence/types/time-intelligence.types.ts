export interface Clock {
  now(): Date;
}

export type Greeting = "Buenos días" | "Buenas tardes" | "Buenas noches";

export type CountdownState = "FUTURE" | "TODAY" | "COMPLETED" | "ARCHIVED";

export type CountdownVisualState = "GREEN" | "YELLOW" | "ORANGE" | "RED" | "PRIMARY" | "COMPLETED" | "ARCHIVED";

export type OperationalPhase =
  | "PLANNING"
  | "REQUEST_ARTWORK"
  | "CONFIRM_INFORMATION"
  | "CONFIRM_PAYMENT"
  | "ASSIGN_RESOURCES"
  | "GENERATE_DAILY_PLAN"
  | "REVIEW_LOGISTICS"
  | "FINAL_CHECKLIST"
  | "OPERATIONAL_EXECUTION"
  | "ARCHIVE";

export interface CurrentTimeContext {
  now: Date;
  localDate: string;
  localTime: string;
  formattedDate: string;
  greeting: Greeting;
  greetingText: string;
  todaySummary: string;
  timeZone: string;
}

export interface EventCountdown {
  days: number;
  label: string;
  state: CountdownState;
  visualState: CountdownVisualState;
}

export interface OperationalTimelineResult {
  phase: OperationalPhase;
  phaseLabel: string;
  nextAction: string;
}

export interface EventTimeIntelligence {
  countdown: EventCountdown;
  timeline: OperationalTimelineResult;
}

export interface EventTimeInput {
  eventDate: string;
  completed?: boolean;
  archived?: boolean;
}

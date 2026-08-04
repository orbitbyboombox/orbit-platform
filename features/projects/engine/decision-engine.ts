import {
  ProjectFinancialStatus,
  RecommendedExperience,
  type DecisionContext,
  type DecisionEngine,
  type ProjectDecision,
} from "./decision.types";
import { MissionPriority } from "./mission.types";
import { PROJECT_STATE_SEQUENCE, ProjectState } from "./project-state";

const RECOMMENDED_EXPERIENCE: Readonly<Record<ProjectState, RecommendedExperience>> = Object.freeze({
  [ProjectState.LEAD]: RecommendedExperience.QUOTATION,
  [ProjectState.QUOTED]: RecommendedExperience.RESERVATION,
  [ProjectState.RESERVED]: RecommendedExperience.CONFIRMATION,
  [ProjectState.CONFIRMED]: RecommendedExperience.PREPARATION,
  [ProjectState.PREPARATION]: RecommendedExperience.PREPARATION,
  [ProjectState.READY]: RecommendedExperience.LIVE_EVENT,
  [ProjectState.LIVE_EVENT]: RecommendedExperience.DELIVERY,
  [ProjectState.DELIVERY]: RecommendedExperience.PROJECT_CLOSING,
  [ProjectState.ARCHIVED]: RecommendedExperience.FUTURE_OPPORTUNITY,
});

const OUTSTANDING_FINANCIAL_STATUSES: readonly ProjectFinancialStatus[] = Object.freeze([
  ProjectFinancialStatus.PENDING,
  ProjectFinancialStatus.PARTIAL,
  ProjectFinancialStatus.OVERDUE,
]);

function defineDecision(decision: ProjectDecision): ProjectDecision {
  return Object.freeze(decision);
}

function getTimeSensitiveReason(
  state: ProjectState,
  reason: string,
  daysUntilEvent?: number,
): string {
  if (daysUntilEvent === undefined) return reason;

  const liveEventIndex = PROJECT_STATE_SEQUENCE.indexOf(ProjectState.LIVE_EVENT);
  const stateIndex = PROJECT_STATE_SEQUENCE.indexOf(state);
  if (stateIndex >= liveEventIndex || daysUntilEvent > 1) return reason;

  if (daysUntilEvent <= 0) return `${reason} The event is today or overdue.`;
  return `${reason} The event is tomorrow.`;
}

function getMissionDecision(context: DecisionContext): ProjectDecision {
  const { currentMission, daysUntilEvent, state } = context;
  const nextStateImpact = currentMission.nextState
    ? `Completing this action prepares the project for ${currentMission.nextState}.`
    : "This keeps the completed client relationship active without reopening the project.";

  return defineDecision({
    title: currentMission.title,
    reason: getTimeSensitiveReason(state, currentMission.reason, daysUntilEvent),
    impact: nextStateImpact,
    estimatedTime: currentMission.estimatedTime,
    priority: currentMission.priority,
    actionLabel: currentMission.title,
    nextRecommendedExperience: RECOMMENDED_EXPERIENCE[state],
  });
}

function getConfirmedDecision(): ProjectDecision {
  return defineDecision({
    title: "Assign Operator",
    reason: "No operator has been assigned.",
    impact: "Preparation cannot continue.",
    estimatedTime: "30 seconds",
    priority: MissionPriority.HIGH,
    actionLabel: "Assign Operator",
    nextRecommendedExperience: RecommendedExperience.PREPARATION,
  });
}

function getPreparationDecision(preparationScore?: number): ProjectDecision {
  if (preparationScore !== undefined && preparationScore >= 100) {
    return defineDecision({
      title: "Ready for Production",
      reason: "The preparation checklist is complete.",
      impact: "The project can become Ready.",
      estimatedTime: "10 seconds",
      priority: MissionPriority.HIGH,
      actionLabel: "Mark Ready",
      nextRecommendedExperience: RecommendedExperience.LIVE_EVENT,
    });
  }

  return defineDecision({
    title: "Complete Checklist",
    reason: "Preparation is incomplete.",
    impact: "Project cannot become Ready.",
    estimatedTime: "5 minutes",
    priority: MissionPriority.HIGH,
    actionLabel: "Complete Checklist",
    nextRecommendedExperience: RecommendedExperience.PREPARATION,
  });
}

function getDeliveryDecision(context: DecisionContext): ProjectDecision {
  if (
    context.financialStatus !== undefined &&
    OUTSTANDING_FINANCIAL_STATUSES.includes(context.financialStatus)
  ) {
    return defineDecision({
      title: "Collect Remaining Balance",
      reason: "The project has an outstanding balance.",
      impact: "Financial closing and project archival cannot be completed.",
      estimatedTime: "30 seconds",
      priority: MissionPriority.HIGH,
      actionLabel: "Collect Balance",
      nextRecommendedExperience: RecommendedExperience.PROJECT_CLOSING,
    });
  }

  return getMissionDecision(context);
}

export function getDecision(context: DecisionContext): ProjectDecision {
  if (context.state === ProjectState.CONFIRMED) return getConfirmedDecision();
  if (context.state === ProjectState.PREPARATION) {
    return getPreparationDecision(context.preparationScore);
  }
  if (context.state === ProjectState.DELIVERY) return getDeliveryDecision(context);
  return getMissionDecision(context);
}

export const decisionEngine: DecisionEngine = Object.freeze({ getDecision });


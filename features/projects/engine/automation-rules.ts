import { AUTOMATION_EVENT_STATE, AUTOMATION_REGISTRY } from "./automation-registry";
import type {
  AutomationEvaluationContext,
  AutomationRule,
  AutomationRulesEngine,
} from "./automation.types";

export function evaluateAutomationRules(
  context: AutomationEvaluationContext,
): AutomationRule[] {
  const { currentState, event } = context;
  const requiredState = AUTOMATION_EVENT_STATE[event.type];

  if (event.state !== currentState || requiredState !== currentState) return [];

  return AUTOMATION_REGISTRY.filter((rule) => rule.triggerEvent === event.type);
}

export const automationRulesEngine: AutomationRulesEngine = Object.freeze({
  evaluate: evaluateAutomationRules,
});


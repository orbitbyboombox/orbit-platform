import { ProjectHealth } from "../domain";

export interface CalculateProjectHealthInput {
  criticalSignals: number;
  riskSignals: number;
  attentionSignals: number;
}

export interface CalculateProjectHealthOutput {
  health: ProjectHealth;
}

export function calculateProjectHealth({
  criticalSignals,
  riskSignals,
  attentionSignals,
}: CalculateProjectHealthInput): CalculateProjectHealthOutput {
  if (criticalSignals > 0) return { health: ProjectHealth.CRITICAL };
  if (riskSignals > 0) return { health: ProjectHealth.RISK };
  if (attentionSignals > 0) return { health: ProjectHealth.ATTENTION };
  return { health: ProjectHealth.HEALTHY };
}

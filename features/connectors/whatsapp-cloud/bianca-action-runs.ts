export const BIANCA_ACTION_RUN_STATUSES = ["PENDING", "RUNNING", "SUCCESS", "FAILED", "ALREADY_DONE"] as const;
export type BiancaActionRunStatus = (typeof BIANCA_ACTION_RUN_STATUSES)[number];

export interface BiancaActionRunInput {
  customerId: string;
  conversationId: string;
  opportunityId: string;
  actionType: string;
  idempotencyKey: string;
  inputSummary: Record<string, unknown>;
  actorType: "SYSTEM_AGENT";
  actorId: "BIANCA";
  source: "WHATSAPP_AGENT" | "WEB_AGENT";
  actionVersion?: string;
}

export interface BiancaActionRunResult {
  status: BiancaActionRunStatus;
  resultSummary?: Record<string, unknown>;
  externalRef?: string | null;
  errorCode?: string | null;
}

export function actionRunIdempotencyKey(input: Omit<BiancaActionRunInput, "idempotencyKey" | "actorType" | "actorId" | "source" | "actionVersion"> & { normalizedInputHash: string }) {
  return `bianca:${input.conversationId}:${input.opportunityId}:${input.actionType}:${input.normalizedInputHash}`;
}

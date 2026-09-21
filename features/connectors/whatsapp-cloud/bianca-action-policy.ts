import type { BiancaRuntimeAction } from "./bianca-turn-state.ts";

export const SAFE_BIANCA_ACTIONS = new Set<BiancaRuntimeAction>([
  "RESPOND_GENERAL", "ASK_MISSING_FIELD", "RECOMMEND_SERVICE", "EXPLAIN_SERVICE",
  "SEND_CATALOG_LINK", "LOOKUP_PRICE", "LOOKUP_AVAILABILITY", "EXPLAIN_PAYMENT",
  "EXPLAIN_LOCATION", "WAIT_FOR_CUSTOMER", "HUMAN_HANDOFF",
]);

export const SIDE_EFFECT_BIANCA_ACTIONS = new Set<BiancaRuntimeAction>([
  "QUOTE_CREATE", "RESERVATION_START", "SEND_EMAIL", "APPLY_DISCOUNT", "PAYMENT_CONFIRM", "CONTRACT_CHANGE",
]);

export function isSafeBiancaAction(action: BiancaRuntimeAction) {
  return SAFE_BIANCA_ACTIONS.has(action);
}

export function actionPolicyReason(action: BiancaRuntimeAction) {
  return SIDE_EFFECT_BIANCA_ACTIONS.has(action) ? "SIDE_EFFECT_ACTION_DISABLED" : isSafeBiancaAction(action) ? null : "ACTION_NOT_ALLOWLISTED";
}

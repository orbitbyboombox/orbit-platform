export type CommercialActorType = "HUMAN" | "SYSTEM_AGENT";
export type CommercialActorId = "HUMAN_USER" | "BIANCA";
export type BiancaAuthorizedAction = "QUOTE_CREATE" | "SEND_EMAIL" | "RESERVATION_START";

export interface CommercialActorContext {
  actorType: CommercialActorType;
  actorId: CommercialActorId;
  source: "WHATSAPP_AGENT" | "WEB_AGENT" | "FOUNDER_UI";
  conversationId?: string;
  opportunityId?: string;
  actionRunId?: string;
}

const BIANCA_ALLOWED_ACTIONS = new Set<BiancaAuthorizedAction>([
  "QUOTE_CREATE",
  "SEND_EMAIL",
  "RESERVATION_START",
]);

export function biancaSystemActor(): CommercialActorContext {
  return { actorType: "SYSTEM_AGENT", actorId: "BIANCA", source: "WHATSAPP_AGENT" };
}

export function canSystemActorPerform(action: string, context: CommercialActorContext) {
  return context.actorType === "SYSTEM_AGENT"
    && context.actorId === "BIANCA"
    && context.source === "WHATSAPP_AGENT"
    && BIANCA_ALLOWED_ACTIONS.has(action as BiancaAuthorizedAction);
}

export function assertBiancaActionAuthorized(action: string, context: CommercialActorContext) {
  if (!canSystemActorPerform(action, context)) throw new Error(`BIANCA_ACTION_DENIED:${action}`);
}

export function allowedBiancaActions() {
  return [...BIANCA_ALLOWED_ACTIONS];
}

import type { NovaConversationState, NovaTimelineEvent } from "../types/nova-channel.types";

export function requestHumanHandoff(state: NovaConversationState, occurredAt: string, handledBy?: string) {
  const conversation: NovaConversationState = { ...state, status: "HUMAN_HANDOFF", humanHandoff: true, lastMessageAt: occurredAt, handledBy };
  const timelineEvent: NovaTimelineEvent = { id: `${state.conversationId}-handoff-requested`, conversationId: state.conversationId, customerId: state.customerId, type: "HUMAN_HANDOFF_REQUESTED", occurredAt, description: "Conversación transferida a BOOMBOX con su contexto intacto." };
  return { conversation, timelineEvent };
}

export function releaseHumanHandoff(state: NovaConversationState, occurredAt: string) {
  const conversation: NovaConversationState = { ...state, status: "ACTIVE", humanHandoff: false, lastMessageAt: occurredAt, handledBy: undefined };
  const timelineEvent: NovaTimelineEvent = { id: `${state.conversationId}-handoff-released`, conversationId: state.conversationId, customerId: state.customerId, type: "HUMAN_HANDOFF_RELEASED", occurredAt, description: "NOVA retomó la conversación con el contexto conservado." };
  return { conversation, timelineEvent };
}

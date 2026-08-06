import type { CommunicationHubIndicators, UnifiedCommunicationEvent, UnifiedConversation } from "../types/communication-hub.types";

export function newestFirst(events: readonly UnifiedCommunicationEvent[]) {
  return [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function calculateCommunicationIndicators(conversations: readonly UnifiedConversation[]): CommunicationHubIndicators {
  return {
    pendingConversations: conversations.filter(({ status }) => status === "ACTIVE").length,
    humanConversations: conversations.filter(({ status }) => status === "HUMAN_HANDOFF").length,
    waitingCustomer: conversations.filter(({ status }) => status === "WAITING_CUSTOMER").length,
    completedConversations: conversations.filter(({ status }) => status === "COMPLETED").length,
  };
}

export interface CommunicationTimelineRepository {
  getByCustomerId(customerId: string): Promise<readonly UnifiedCommunicationEvent[]>;
  append(event: UnifiedCommunicationEvent): Promise<void>;
}

import type { UnifiedCommunicationEvent, UnifiedConversation } from "../types/communication-hub.types";
import { calculateCommunicationIndicators, newestFirst } from "../timeline/unified-communication.timeline";
import type { CommunicationTimelineRepository } from "../timeline/unified-communication.timeline";

/** Retained as a fixture only. Production routes never import this module. */
export class InMemoryCommunicationTimelineRepository implements CommunicationTimelineRepository {
  private readonly events: UnifiedCommunicationEvent[] = [];
  async getByCustomerId(customerId: string) { return newestFirst(this.events.filter((event) => event.customerId === customerId)); }
  async append(event: UnifiedCommunicationEvent) { this.events.push(event); }
}

export const MOCK_HUB_CONVERSATIONS: readonly UnifiedConversation[] = [
  { id: "conversation-maria", customerId: "customer-maria", customerName: "María González", status: "WAITING_CUSTOMER", novaState: { conversationId: "conversation-maria", customerId: "customer-maria", channel: "WHATSAPP_BUSINESS", status: "WAITING_CUSTOMER", humanHandoff: false, startedAt: "2026-08-05T09:15:00-04:00", lastMessageAt: "2026-08-05T17:42:00-04:00" }, lastChannel: "WHATSAPP_BUSINESS", lastInteractionAt: "2026-08-05T17:42:00-04:00" },
  { id: "conversation-camilo", customerId: "customer-camilo", customerName: "Camilo Almarza", status: "HUMAN_HANDOFF", novaState: { conversationId: "conversation-camilo", customerId: "customer-camilo", channel: "EMAIL_ASSISTANT", status: "HUMAN_HANDOFF", humanHandoff: true, handledBy: "Matías", startedAt: "2026-08-04T10:00:00-04:00", lastMessageAt: "2026-08-05T16:30:00-04:00" }, assignedHuman: "Matías", lastChannel: "GOOGLE_GMAIL", lastInteractionAt: "2026-08-05T16:30:00-04:00" },
  { id: "conversation-antonia", customerId: "customer-antonia", customerName: "Antonia Silva", status: "ACTIVE", novaState: { conversationId: "conversation-antonia", customerId: "customer-antonia", channel: "INSTAGRAM_DIRECT", status: "ACTIVE", humanHandoff: false, startedAt: "2026-08-05T15:20:00-04:00", lastMessageAt: "2026-08-05T15:25:00-04:00" }, lastChannel: "INSTAGRAM_DIRECT", lastInteractionAt: "2026-08-05T15:25:00-04:00" },
  { id: "conversation-felipe", customerId: "customer-felipe", customerName: "Felipe Soto", status: "COMPLETED", novaState: { conversationId: "conversation-felipe", customerId: "customer-felipe", channel: "WEB_CHAT", status: "COMPLETED", humanHandoff: false, startedAt: "2026-08-03T12:00:00-04:00", lastMessageAt: "2026-08-04T18:00:00-04:00" }, lastChannel: "WEB_CHAT", lastInteractionAt: "2026-08-04T18:00:00-04:00" },
] as const;

export const MOCK_HUB_EVENTS = newestFirst([
  { id: "event-5", conversationId: "conversation-maria", customerId: "customer-maria", channel: "WHATSAPP_BUSINESS", direction: "OUTBOUND", type: "NOVA_RESPONSE", occurredAt: "2026-08-05T17:42:00-04:00", summary: "¿Dónde se realizará el evento?" },
  { id: "event-4", conversationId: "conversation-maria", customerId: "customer-maria", channel: "WHATSAPP_BUSINESS", direction: "INBOUND", type: "CUSTOMER_REPLY", occurredAt: "2026-08-05T17:41:00-04:00", summary: "Es un matrimonio." },
  { id: "event-3", conversationId: "conversation-camilo", customerId: "customer-camilo", channel: "GOOGLE_GMAIL", direction: "SYSTEM", type: "HUMAN_HANDOFF", occurredAt: "2026-08-05T16:30:00-04:00", summary: "Matías tomó la conversación." },
  { id: "event-2", conversationId: "conversation-antonia", customerId: "customer-antonia", channel: "INSTAGRAM_DIRECT", direction: "INBOUND", type: "QUOTATION_REQUESTED", occurredAt: "2026-08-05T15:25:00-04:00", summary: "Cotización solicitada para evento empresa." },
  { id: "event-1", conversationId: "conversation-felipe", customerId: "customer-felipe", channel: "WEB_CHAT", direction: "OUTBOUND", type: "PORTAL_GENERATED", occurredAt: "2026-08-04T18:00:00-04:00", summary: "Portal permanente generado." },
] satisfies readonly UnifiedCommunicationEvent[]);

export const MOCK_HUB_INDICATORS = calculateCommunicationIndicators(MOCK_HUB_CONVERSATIONS);

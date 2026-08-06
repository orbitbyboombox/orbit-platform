import type { CustomerMemoryRecord } from "@/features/customer-memory";
import type { OperationalRecommendation } from "@/features/operations-intelligence";
import type { ProfitRecommendation } from "@/features/profit-engine";
import type { ConfirmedMemoryUpdate } from "@/features/customer-memory";
import type { NovaChannelOutput, NovaConversationState } from "@/features/nova-channel";

export type CommunicationChannel = "GOOGLE_GMAIL" | "WHATSAPP_BUSINESS" | "INSTAGRAM_DIRECT" | "WEB_CHAT" | "PHONE_LOG" | "FUTURE";
export type CommunicationDirection = "INBOUND" | "OUTBOUND" | "SYSTEM";
export type UnifiedConversationStatus = "ACTIVE" | "WAITING_CUSTOMER" | "HUMAN_HANDOFF" | "COMPLETED";
export type CommunicationTimelineEventType = "CONVERSATION_STARTED" | "CUSTOMER_REPLY" | "QUOTATION_REQUESTED" | "QUOTATION_SENT" | "RESERVATION_STARTED" | "PORTAL_GENERATED" | "CONTRACT_SENT" | "PAYMENT_CONFIRMED" | "REMINDER_SENT" | "HUMAN_HANDOFF" | "HUMAN_HANDOFF_RELEASED" | "CONVERSATION_CLOSED" | "NOVA_RESPONSE";

export interface ChannelCommunicationEnvelope {
  id: string;
  channel: CommunicationChannel;
  conversationId: string;
  customerId: string;
  externalParticipantId: string;
  content: string;
  occurredAt: string;
  confirmedInformation?: ConfirmedMemoryUpdate;
}

export interface NormalizedCommunication {
  id: string;
  channel: CommunicationChannel;
  conversationId: string;
  customerId: string;
  participantId: string;
  content: string;
  direction: CommunicationDirection;
  occurredAt: string;
  confirmedInformation?: ConfirmedMemoryUpdate;
}

export interface UnifiedCommunicationEvent {
  id: string;
  conversationId: string;
  customerId: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  type: CommunicationTimelineEventType;
  occurredAt: string;
  summary: string;
}

export interface UnifiedConversation {
  id: string;
  customerId: string;
  customerName?: string;
  status: UnifiedConversationStatus;
  novaState: NovaConversationState;
  assignedHuman?: string;
  lastChannel: CommunicationChannel;
  lastInteractionAt: string;
}

export interface CommunicationHubContext {
  memory: CustomerMemoryRecord;
  operationsRecommendation?: OperationalRecommendation;
  profitRecommendation?: ProfitRecommendation;
}

export interface ChannelDispatchRequest {
  channel: CommunicationChannel;
  conversationId: string;
  participantId: string;
  content: string;
  correlationId: string;
}

export interface CommunicationHubResult {
  nova: NovaChannelOutput;
  conversation: UnifiedConversation;
  events: readonly UnifiedCommunicationEvent[];
  dispatch: ChannelDispatchRequest;
}

export interface CommunicationHubIndicators {
  pendingConversations: number;
  humanConversations: number;
  waitingCustomer: number;
  completedConversations: number;
}

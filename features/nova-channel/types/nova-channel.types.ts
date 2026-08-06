import type { ConfirmedMemoryUpdate, CustomerMemoryRecord, CustomerTimelineContext } from "@/features/customer-memory";
import type { OperationalRecommendation } from "@/features/operations-intelligence";
import type { ProfitRecommendation } from "@/features/profit-engine";

export type NovaChannel = "WHATSAPP_BUSINESS" | "INSTAGRAM_DIRECT" | "WEB_CHAT" | "EMAIL_ASSISTANT" | "FUTURE";
export type NovaConversationStatus = "ACTIVE" | "WAITING_CUSTOMER" | "READY_FOR_QUOTATION" | "READY_FOR_PORTAL" | "HUMAN_HANDOFF" | "COMPLETED";
export type NovaNextAction = "ASK_EVENT_TYPE" | "ASK_LOCATION" | "ASK_EVENT_DATE" | "ASK_ESTIMATED_GUESTS" | "RECOMMEND_HOURS" | "RECOMMEND_SERVICE" | "GENERATE_QUOTATION" | "GENERATE_RESERVATION_PORTAL" | "WAIT_FOR_HUMAN" | "NONE";

export interface NovaNormalizedMessage {
  id: string;
  channel: NovaChannel;
  conversationId: string;
  customerId: string;
  senderExternalId: string;
  text: string;
  receivedAt: string;
  confirmedInformation?: ConfirmedMemoryUpdate;
}

export interface NovaConversationState {
  conversationId: string;
  customerId: string;
  channel: NovaChannel;
  status: NovaConversationStatus;
  humanHandoff: boolean;
  startedAt: string;
  lastMessageAt: string;
  handledBy?: string;
}

export type NovaTimelineEventType = "CONVERSATION_STARTED" | "INFORMATION_REQUESTED" | "HOURS_RECOMMENDED" | "SERVICE_RECOMMENDED" | "QUOTATION_REQUESTED" | "QUOTATION_SENT" | "RESERVATION_STARTED" | "PORTAL_GENERATED" | "CONTRACT_SENT" | "PAYMENT_CONFIRMED" | "HUMAN_HANDOFF_REQUESTED" | "HUMAN_HANDOFF_RELEASED";

export interface NovaTimelineEvent {
  id: string;
  conversationId: string;
  customerId: string;
  type: NovaTimelineEventType;
  occurredAt: string;
  description: string;
}

export interface NovaKnowledgeContext {
  memory: CustomerMemoryRecord;
  timeline?: CustomerTimelineContext;
  operationsRecommendation?: OperationalRecommendation;
  profitRecommendation?: ProfitRecommendation;
}

export interface NovaChannelInput {
  message: NovaNormalizedMessage;
  memory: CustomerMemoryRecord;
  conversation?: NovaConversationState;
  operationsRecommendation?: OperationalRecommendation;
  profitRecommendation?: ProfitRecommendation;
}

export interface NovaChannelOutput {
  response: string;
  nextRecommendedAction: NovaNextAction;
  conversationStatus: NovaConversationStatus;
  timelineEvent: NovaTimelineEvent;
}

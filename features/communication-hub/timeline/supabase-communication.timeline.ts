import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTimelineRepository } from "@/features/projects/infrastructure";
import type { AppendTimelineEvent } from "@/features/projects/infrastructure";
import type { CommunicationTimelineRepository } from "./unified-communication.timeline";
import type { CommunicationChannel, CommunicationDirection, CommunicationHubIndicators, CommunicationTimelineEventType, UnifiedCommunicationEvent, UnifiedConversation, UnifiedConversationStatus } from "../types/communication-hub.types";
import { calculateCommunicationIndicators, newestFirst } from "./unified-communication.timeline";

interface ConversationRow { id: string; customer_id: string; status: string; nova_enabled: boolean; human_owner_id: string | null; context: Record<string, unknown>; updated_at: string; }
interface CustomerRow { id: string; full_name: string; }
interface CommunicationRow { id: string; customer_id: string; channel: string; direction: string; communication_type: string; thread_key: string; occurred_at: string; }

export interface CommunicationHubProjection {
  conversations: readonly UnifiedConversation[];
  events: readonly UnifiedCommunicationEvent[];
  indicators: CommunicationHubIndicators;
}

const asChannel = (value: string): CommunicationChannel => ["GOOGLE_GMAIL", "WHATSAPP_BUSINESS", "INSTAGRAM_DIRECT", "WEB_CHAT", "PHONE_LOG"].includes(value) ? value as CommunicationChannel : "FUTURE";
const asDirection = (value: string): CommunicationDirection => ["INBOUND", "OUTBOUND", "SYSTEM"].includes(value) ? value as CommunicationDirection : "SYSTEM";
const asStatus = (value: string): UnifiedConversationStatus => ["ACTIVE", "WAITING_CUSTOMER", "HUMAN_HANDOFF", "COMPLETED"].includes(value) ? value as UnifiedConversationStatus : "ACTIVE";
const asEventType = (value: string): CommunicationTimelineEventType => ["CONVERSATION_STARTED", "CUSTOMER_REPLY", "QUOTATION_REQUESTED", "QUOTATION_SENT", "RESERVATION_STARTED", "PORTAL_GENERATED", "CONTRACT_SENT", "PAYMENT_CONFIRMED", "REMINDER_SENT", "HUMAN_HANDOFF", "HUMAN_HANDOFF_RELEASED", "CONVERSATION_CLOSED", "NOVA_RESPONSE"].includes(value) ? value as CommunicationTimelineEventType : "NOVA_RESPONSE";
const asNovaChannel = (channel: CommunicationChannel) => channel === "GOOGLE_GMAIL" ? "EMAIL_ASSISTANT" as const : channel === "PHONE_LOG" ? "FUTURE" as const : channel;

function timelineAction(event: UnifiedCommunicationEvent): AppendTimelineEvent["action"] {
  if (event.type === "HUMAN_HANDOFF") return "HUMAN_HANDOFF";
  if (event.type === "HUMAN_HANDOFF_RELEASED") return "HUMAN_HANDOFF_RELEASED";
  if (event.type === "PAYMENT_CONFIRMED") return "PAYMENT_CONFIRMED";
  if (event.type === "PORTAL_GENERATED") return "PORTAL_CREATED";
  if (event.channel === "GOOGLE_GMAIL") return "EMAIL_SENT";
  return "NOVA_RECOMMENDATION";
}

export class SupabaseCommunicationTimelineRepository implements CommunicationTimelineRepository {
  private readonly timeline: SupabaseTimelineRepository;
  constructor(private readonly client: SupabaseClient) { this.timeline = new SupabaseTimelineRepository(client); }

  async getByCustomerId(customerId: string): Promise<readonly UnifiedCommunicationEvent[]> {
    const events = await this.timeline.findByCustomer(customerId);
    return events.filter((event) => event.entityType === "Communication").map((event) => ({
      id: event.id, conversationId: event.entityId, customerId,
      channel: event.source === "Gmail" ? "GOOGLE_GMAIL" : "FUTURE",
      direction: "SYSTEM", type: event.action === "HUMAN_HANDOFF" ? "HUMAN_HANDOFF" : event.action === "HUMAN_HANDOFF_RELEASED" ? "HUMAN_HANDOFF_RELEASED" : "NOVA_RESPONSE",
      occurredAt: event.occurredAt, summary: event.humanMessage,
    }));
  }

  async append(event: UnifiedCommunicationEvent): Promise<void> {
    await this.timeline.append({ orbitEventId: `ORB-COMM-${event.conversationId}`, actorLabel: event.direction === "INBOUND" ? "Cliente" : event.direction === "OUTBOUND" ? "NOVA" : "Sistema", source: event.channel === "GOOGLE_GMAIL" ? "Gmail" : event.direction === "INBOUND" ? "Customer" : "NOVA", action: timelineAction(event), entityType: "Communication", entityId: event.conversationId, customerId: event.customerId, humanMessage: event.summary, correlationId: event.id, occurredAt: event.occurredAt });
  }
}

export async function loadCommunicationHubProjection(client: SupabaseClient): Promise<CommunicationHubProjection> {
  const [{ data: stateRows, error: stateError }, { data: customerRows, error: customerError }, { data: communicationRows, error: communicationError }] = await Promise.all([
    client.from("conversation_states").select("id,customer_id,status,nova_enabled,human_owner_id,context,updated_at").order("updated_at", { ascending: false }),
    client.from("customers").select("id,full_name").is("deleted_at", null),
    client.from("communications").select("id,customer_id,channel,direction,communication_type,thread_key,occurred_at").order("occurred_at", { ascending: false }),
  ]);
  const error = stateError ?? customerError ?? communicationError;
  if (error) throw error;
  const customers = new Map((customerRows as CustomerRow[]).map((row) => [row.id, row.full_name]));
  const communications = communicationRows as CommunicationRow[];
  const conversations = (stateRows as ConversationRow[]).map((row) => {
    const recent = communications.find((item) => item.customer_id === row.customer_id);
    const channel = asChannel(recent?.channel ?? String(row.context.channel ?? "FUTURE"));
    const status = asStatus(row.status);
    return { id: row.id, customerId: row.customer_id, customerName: customers.get(row.customer_id), status, novaState: { conversationId: row.id, customerId: row.customer_id, channel: asNovaChannel(channel), status, humanHandoff: status === "HUMAN_HANDOFF", handledBy: row.human_owner_id ?? undefined, startedAt: String(row.context.startedAt ?? row.updated_at), lastMessageAt: recent?.occurred_at ?? row.updated_at }, assignedHuman: row.human_owner_id ?? undefined, lastChannel: channel, lastInteractionAt: recent?.occurred_at ?? row.updated_at } satisfies UnifiedConversation;
  });
  const events = newestFirst(communications.map((row) => ({ id: row.id, conversationId: row.thread_key, customerId: row.customer_id, channel: asChannel(row.channel), direction: asDirection(row.direction), type: asEventType(row.communication_type), occurredAt: row.occurred_at, summary: row.communication_type.replaceAll("_", " ") } satisfies UnifiedCommunicationEvent)));
  return { conversations, events, indicators: calculateCommunicationIndicators(conversations) };
}

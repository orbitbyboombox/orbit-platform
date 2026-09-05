import type { SupabaseClient } from "@supabase/supabase-js";
import { CustomerMemoryEngine, type CustomerMemoryField, type CustomerMemoryRecord } from "@/features/customer-memory";
import { ORBIT_TIME_ENGINE } from "@/features/time-intelligence";
import { NovaChannelEngine } from "@/features/nova-channel";
import {
  CommunicationHubEngine,
  SupabaseCommunicationTimelineRepository,
  type UnifiedConversation,
} from "@/features/communication-hub";
import { createAdminClient } from "@/lib/supabase/admin";
import { QueuedWhatsAppDispatcher } from "./queued-whatsapp.dispatcher";

interface WebhookEventRow {
  id: string;
  provider_message_id: string;
  sender_wa_id: string;
  profile_name: string | null;
  message_type: string;
  text_body: string | null;
  occurred_at: string;
  processing_status: string;
}

interface ConversationStateRow {
  id: string;
  customer_id: string;
  status: string;
  nova_enabled: boolean;
  human_owner_id: string | null;
  context: Record<string, unknown>;
  updated_at: string;
}

const MEMORY_FIELDS = new Set<CustomerMemoryField>([
  "customerName",
  "eventType",
  "eventDate",
  "eventLocation",
  "estimatedGuests",
  "recommendedHours",
  "selectedService",
  "currentTimelineStage",
  "quotationStatus",
  "reservationStatus",
  "paymentStatus",
  "portalStatus",
  "lastConversationDate",
]);

function memoryRecord(customerId: string, customerName: string, context: Record<string, unknown>): CustomerMemoryRecord {
  const confirmedFields = Array.isArray(context.confirmedFields)
    ? context.confirmedFields.filter((field): field is CustomerMemoryField => typeof field === "string" && MEMORY_FIELDS.has(field as CustomerMemoryField))
    : [];
  return {
    customerId,
    customerName: typeof context.customerName === "string" ? context.customerName : customerName,
    eventType: typeof context.eventType === "string" ? context.eventType : undefined,
    eventDate: typeof context.eventDate === "string" ? context.eventDate : undefined,
    eventLocation: typeof context.eventLocation === "string" ? context.eventLocation : undefined,
    estimatedGuests: typeof context.estimatedGuests === "number" ? context.estimatedGuests : undefined,
    recommendedHours: typeof context.recommendedHours === "number" ? context.recommendedHours : undefined,
    selectedService: typeof context.selectedService === "string" ? context.selectedService : undefined,
    currentTimelineStage: typeof context.currentTimelineStage === "string" ? context.currentTimelineStage : undefined,
    quotationStatus: context.quotationStatus as CustomerMemoryRecord["quotationStatus"],
    reservationStatus: context.reservationStatus as CustomerMemoryRecord["reservationStatus"],
    paymentStatus: context.paymentStatus as CustomerMemoryRecord["paymentStatus"],
    portalStatus: context.portalStatus as CustomerMemoryRecord["portalStatus"],
    lastConversationDate: typeof context.lastConversationDate === "string" ? context.lastConversationDate : undefined,
    confirmedFields,
  };
}

function currentConversation(row: ConversationStateRow, customerName: string, occurredAt: string): UnifiedConversation {
  const handoff = row.status === "HUMAN_HANDOFF" || row.nova_enabled === false;
  const status = handoff ? "HUMAN_HANDOFF" as const : row.status === "WAITING_CUSTOMER" ? "WAITING_CUSTOMER" as const : row.status === "COMPLETED" ? "COMPLETED" as const : "ACTIVE" as const;
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName,
    status,
    novaState: {
      conversationId: row.id,
      customerId: row.customer_id,
      channel: "WHATSAPP_BUSINESS",
      status,
      humanHandoff: handoff,
      handledBy: row.human_owner_id ?? undefined,
      startedAt: typeof row.context.startedAt === "string" ? row.context.startedAt : row.updated_at,
      lastMessageAt: occurredAt,
    },
    assignedHuman: row.human_owner_id ?? undefined,
    lastChannel: "WHATSAPP_BUSINESS",
    lastInteractionAt: occurredAt,
  };
}

async function resolveCustomer(client: SupabaseClient, event: WebhookEventRow) {
  const { data, error } = await client.rpc("resolve_whatsapp_customer", {
    p_sender_wa_id: event.sender_wa_id,
    p_profile_name: event.profile_name,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("WhatsApp customer identity resolution returned no customer.");
  const { data: customer, error: customerError } = await client
    .from("customers")
    .select("id,full_name")
    .eq("id", data)
    .single();
  if (customerError) throw customerError;
  return customer as { id: string; full_name: string };
}

async function resolveConversation(client: SupabaseClient, customerId: string, senderWaId: string, occurredAt: string) {
  const { data: existing, error: readError } = await client
    .from("conversation_states")
    .select("id,customer_id,status,nova_enabled,human_owner_id,context,updated_at")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing as ConversationStateRow;

  const { data, error } = await client
    .from("conversation_states")
    .insert({
      customer_id: customerId,
      status: "ACTIVE",
      nova_enabled: true,
      context: {
        channel: "WHATSAPP_BUSINESS",
        externalParticipantId: senderWaId,
        startedAt: occurredAt,
      },
    })
    .select("id,customer_id,status,nova_enabled,human_owner_id,context,updated_at")
    .single();
  if (error) throw error;
  return data as ConversationStateRow;
}

async function loadMemory(client: SupabaseClient, customerId: string, customerName: string) {
  const { data, error } = await client
    .from("customer_memory")
    .select("context")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  const context = data?.context && typeof data.context === "object" ? data.context as Record<string, unknown> : {};
  return memoryRecord(customerId, customerName, context);
}

async function persistInboundCommunication(client: SupabaseClient, event: WebhookEventRow, conversationId: string, customerId: string) {
  const { error } = await client.from("communications").insert({
    customer_id: customerId,
    channel: "WHATSAPP_BUSINESS",
    direction: "INBOUND",
    communication_type: "CUSTOMER_REPLY",
    thread_key: conversationId,
    body: event.text_body ?? "",
    status: "RECEIVED",
    external_message_id: event.provider_message_id,
    occurred_at: event.occurred_at,
  });
  if (error) throw error;
}

async function persistOutboundCommunication(client: SupabaseClient, conversationId: string, customerId: string, response: string, occurredAt: string, correlationId: string) {
  if (!response.trim()) return;
  const { error } = await client.from("communications").insert({
    customer_id: customerId,
    channel: "WHATSAPP_BUSINESS",
    direction: "OUTBOUND",
    communication_type: "NOVA_RESPONSE",
    thread_key: conversationId,
    body: response,
    status: "QUEUED",
    external_message_id: correlationId,
    occurred_at: occurredAt,
  });
  if (error) throw error;
}

export async function processWhatsAppWebhookEvent(providerMessageId: string) {
  const client = createAdminClient();
  const now = new Date().toISOString();

  const { data: claimed, error: claimError } = await client
    .from("whatsapp_webhook_events")
    .update({ processing_status: "PROCESSING", processing_error: null, updated_at: now })
    .eq("provider", "META_CLOUD_API")
    .eq("provider_message_id", providerMessageId)
    .eq("processing_status", "RECEIVED")
    .select("id,provider_message_id,sender_wa_id,profile_name,message_type,text_body,occurred_at,processing_status")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { ok: true as const, skipped: true as const };

  const event = claimed as WebhookEventRow;
  try {
    if (event.message_type !== "text" || !event.text_body?.trim()) {
      await client.from("whatsapp_webhook_events").update({ processing_status: "UNSUPPORTED", updated_at: new Date().toISOString() }).eq("id", event.id);
      return { ok: true as const, unsupported: true as const };
    }

    const customer = await resolveCustomer(client, event);
    const conversationState = await resolveConversation(client, customer.id, event.sender_wa_id, event.occurred_at);
    await persistInboundCommunication(client, event, conversationState.id, customer.id);

    const memory = await loadMemory(client, customer.id, customer.full_name);
    const memoryEngine = new CustomerMemoryEngine(ORBIT_TIME_ENGINE);
    const engine = new CommunicationHubEngine(
      new NovaChannelEngine(memoryEngine),
      new SupabaseCommunicationTimelineRepository(client),
      new QueuedWhatsAppDispatcher(client, customer.id),
    );
    const current = currentConversation(conversationState, customer.full_name, event.occurred_at);
    const result = await engine.receive(
      {
        id: event.provider_message_id,
        channel: "WHATSAPP_BUSINESS",
        conversationId: conversationState.id,
        customerId: customer.id,
        externalParticipantId: event.sender_wa_id,
        content: event.text_body,
        occurredAt: event.occurred_at,
      },
      { memory },
      current,
    );

    await client.from("conversation_states").update({
      status: result.conversation.status,
      nova_enabled: !result.suppressed,
      human_owner_id: result.conversation.assignedHuman ?? null,
      context: {
        ...conversationState.context,
        channel: "WHATSAPP_BUSINESS",
        externalParticipantId: event.sender_wa_id,
        lastInboundMessageId: event.provider_message_id,
        lastMessageAt: event.occurred_at,
      },
      updated_at: new Date().toISOString(),
    }).eq("id", conversationState.id);

    if (!result.suppressed)
      await persistOutboundCommunication(client, conversationState.id, customer.id, result.nova.response, event.occurred_at, event.provider_message_id);

    const { error: finishError } = await client.from("whatsapp_webhook_events").update({
      processing_status: "PROCESSED",
      customer_id: customer.id,
      conversation_id: conversationState.id,
      processing_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", event.id);
    if (finishError) throw finishError;

    return { ok: true as const, suppressed: Boolean(result.suppressed), customerId: customer.id, conversationId: conversationState.id };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await client.from("whatsapp_webhook_events").update({
      processing_status: "FAILED",
      processing_error: detail.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("id", event.id);
    console.error("whatsapp.processor.failed", { providerMessageId, detail });
    return { ok: false as const, error: detail };
  }
}

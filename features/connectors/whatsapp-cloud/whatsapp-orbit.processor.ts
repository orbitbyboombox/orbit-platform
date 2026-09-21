import type { SupabaseClient } from "@supabase/supabase-js";
import { CustomerMemoryEngine, type CustomerMemoryField, type CustomerMemoryRecord } from "@/features/customer-memory";
import { ORBIT_TIME_ENGINE } from "@/features/time-intelligence";
import { NovaChannelEngine } from "@/features/nova-channel";
import {
  CommunicationHubEngine,
  SupabaseCommunicationTimelineRepository,
  type UnifiedConversation,
  type CommunicationChannelDispatcher,
} from "@/features/communication-hub";
import { createAdminClient } from "@/lib/supabase/admin";
import { QueuedWhatsAppDispatcher } from "./queued-whatsapp.dispatcher";
import { WhatsAppAiResponder, type WhatsAppAiDecision, type WhatsAppConversationHistoryItem } from "./whatsapp-ai.responder";
import type { WhatsAppCatalogDeliveryResult } from "./whatsapp-catalog.delivery";
import { BiancaAgentOrchestrator } from "./bianca-agent-orchestrator";
import { whatsappAutomationEnabled } from "./meta-whatsapp-cloud";
import { biancaCanProcessCustomerMessage, biancaQaModeEnabled } from "./bianca-policy";
import { prepareBiancaOpportunityContext } from "./bianca-opportunity-context";
import { biancaShadowModeEnabled, createBiancaShadowDecision, shadowConfidence } from "./bianca-shadow-mode.ts";
import { persistBiancaShadowDecision } from "./bianca-shadow-persistence.ts";
import { biancaAutomationRouting, biancaSafeReplyConfiguration, evaluateBiancaSafeReply, resolveCanonicalBiancaSafeReplyEvidence } from "./bianca-safe-reply";
import { persistBiancaSafeReply } from "./bianca-safe-reply-persistence";
import { planBiancaTurn } from "./bianca-commercial-planner";
import { logWhatsApp } from "./whatsapp-observability";
import { serializeWhatsAppError } from "./whatsapp-observability";
import { WHATSAPP_TENANT_SLUG } from "./whatsapp-tenant";

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

interface WhatsAppCustomer {
  id: string;
  full_name: string;
  email: string | null;
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

class ShadowWhatsAppDispatcher implements CommunicationChannelDispatcher {
  async dispatch() {
    // Deliberately no-op. Shadow Mode must never enqueue an outbound message.
  }
}

function memoryRecord(customerId: string, customerName: string, context: Record<string, unknown>): CustomerMemoryRecord {
  const confirmedFields = Array.isArray(context.confirmedFields)
    ? context.confirmedFields.filter((field): field is CustomerMemoryField => typeof field === "string" && MEMORY_FIELDS.has(field as CustomerMemoryField))
    : [];
  return {
    customerId,
    customerName: context.preferredNameConfirmed === true && typeof context.preferredName === "string"
      ? context.preferredName
      : undefined,
    eventType: typeof context.eventType === "string" ? context.eventType : undefined,
    eventDate: typeof context.eventDate === "string" ? context.eventDate : undefined,
    eventLocation: typeof context.eventLocation === "string" ? context.eventLocation : undefined,
    estimatedGuests: typeof context.estimatedGuests === "number" ? context.estimatedGuests : undefined,
    recommendedHours: typeof context.recommendedHours === "number" ? context.recommendedHours : undefined,
    selectedService: typeof context.selectedService === "string" ? context.selectedService : undefined,
    selectedServices: Array.isArray(context.selectedServices)
      ? context.selectedServices.filter((item): item is string => typeof item === "string")
      : undefined,
    currentTimelineStage: typeof context.currentTimelineStage === "string" ? context.currentTimelineStage : undefined,
    quotationStatus: context.quotationStatus as CustomerMemoryRecord["quotationStatus"],
    reservationStatus: context.reservationStatus as CustomerMemoryRecord["reservationStatus"],
    paymentStatus: context.paymentStatus as CustomerMemoryRecord["paymentStatus"],
    portalStatus: context.portalStatus as CustomerMemoryRecord["portalStatus"],
    lastConversationDate: typeof context.lastConversationDate === "string" ? context.lastConversationDate : undefined,
    confirmedFields,
  };
}

function currentConversation(row: ConversationStateRow, customerName: string, occurredAt: string, qaOverride = false): UnifiedConversation {
  const handoff = row.status === "HUMAN_HANDOFF" || row.nova_enabled === false;
  // QA mode is scoped to an explicit conversation or phone allow-list and
  // must be able to resume BIANCA after a previous human takeover or
  // manual-review result.
  // Global conversations retain the hard human-handoff gate.
  const effectiveHandoff = handoff && !qaOverride;
  const status = effectiveHandoff ? "HUMAN_HANDOFF" as const : row.status === "WAITING_CUSTOMER" && !qaOverride ? "WAITING_CUSTOMER" as const : row.status === "COMPLETED" && !qaOverride ? "COMPLETED" as const : "ACTIVE" as const;
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
      humanHandoff: effectiveHandoff,
      handledBy: effectiveHandoff ? row.human_owner_id ?? undefined : undefined,
      startedAt: typeof row.context.startedAt === "string" ? row.context.startedAt : row.updated_at,
      lastMessageAt: occurredAt,
    },
    assignedHuman: effectiveHandoff ? row.human_owner_id ?? undefined : undefined,
    lastChannel: "WHATSAPP_BUSINESS",
    lastInteractionAt: occurredAt,
  };
}

async function resolveCustomer(client: SupabaseClient, event: WebhookEventRow): Promise<WhatsAppCustomer> {
  const { data, error } = await client.rpc("resolve_whatsapp_customer", {
    p_sender_wa_id: event.sender_wa_id,
    p_profile_name: event.profile_name,
  });
  if (error) {
    // Production CRM keeps customers.email NOT NULL. Older deployments of the
    // identity RPC predate the WhatsApp email-less inbound fallback, so recover
    // deterministically here while the idempotent migration is rolled out.
    if (error.code !== "23502") throw error;
    const normalizedPhone = event.sender_wa_id.replace(/[^0-9]/g, "");
    if (!normalizedPhone) throw error;
    const fallbackEmail = `whatsapp-${normalizedPhone}@inbound.invalid`;
    const { data: fallbackCustomer, error: fallbackError } = await client
      .from("customers")
      .insert({
        full_name: event.profile_name?.trim() || "Cliente WhatsApp",
        email: fallbackEmail,
        phone: `+${normalizedPhone}`,
        metadata: {
          leadSource: "WHATSAPP",
          whatsappWaId: normalizedPhone,
          whatsappFirstSeenAt: new Date().toISOString(),
          whatsappLastSeenAt: new Date().toISOString(),
          emailPlaceholder: true,
        },
      })
      .select("id,full_name,email")
      .single();
    if (fallbackError) throw fallbackError;
    return fallbackCustomer as WhatsAppCustomer;
  }
  if (typeof data !== "string") throw new Error("WhatsApp customer identity resolution returned no customer.");
  const { data: customer, error: customerError } = await client
    .from("customers")
    .select("id,full_name,email")
    .eq("id", data)
    .single();
  if (customerError) throw customerError;
  return customer as WhatsAppCustomer;
}

async function resolveConversation(client: SupabaseClient, customerId: string, senderWaId: string, occurredAt: string, automationEnabled: boolean) {
  const { data: existing, error: readError } = await client
    .from("conversation_states")
    .select("id,customer_id,status,nova_enabled,human_owner_id,context,updated_at")
    .eq("customer_id", customerId)
    .eq("tenant_slug", WHATSAPP_TENANT_SLUG)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing as ConversationStateRow;

  const { data, error } = await client
    .from("conversation_states")
    .insert({
      tenant_slug: WHATSAPP_TENANT_SLUG,
      customer_id: customerId,
      status: automationEnabled ? "ACTIVE" : "HUMAN_HANDOFF",
      nova_enabled: automationEnabled,
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
  return { record: memoryRecord(customerId, customerName, context), context };
}

async function loadConversationHistory(client: SupabaseClient, conversationId: string): Promise<WhatsAppConversationHistoryItem[]> {
  const { data, error } = await client
    .from("communications")
    .select("direction,body,occurred_at")
    .eq("thread_key", conversationId)
    .eq("tenant_slug", WHATSAPP_TENANT_SLUG)
    .order("occurred_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).reverse().map((row) => ({
    direction: row.direction === "INBOUND" ? "INBOUND" : row.direction === "OUTBOUND" ? "OUTBOUND" : "SYSTEM",
    body: row.body ?? "",
    occurredAt: row.occurred_at,
  }));
}

async function persistInboundCommunication(client: SupabaseClient, event: WebhookEventRow, conversationId: string, customerId: string) {
  const { error } = await client.from("communications").insert({
    tenant_slug: WHATSAPP_TENANT_SLUG,
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
    tenant_slug: WHATSAPP_TENANT_SLUG,
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

async function replaceQueuedWhatsAppResponse(client: SupabaseClient, correlationId: string, response: string) {
  const { error } = await client.from("whatsapp_outbound_messages").update({
    text_body: response,
    updated_at: new Date().toISOString(),
  }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("correlation_id", correlationId).eq("status", "PENDING");
  if (error) throw error;
}

function canonicalMemoryUpdates(decision: WhatsAppAiDecision, occurredAt: string) {
  const updates: Record<string, unknown> = { lastConversationDate: occurredAt };
  const confirmed = new Set<CustomerMemoryField>(["lastConversationDate"]);
  const locationParts: string[] = [];
  const primaryService = decision.fields.find((item) => item.confidence === "CONFIRMED" && item.field === "requestedService" && typeof item.value === "string");
  const secondaryServices = decision.fields
    .filter((item) => item.confidence === "CONFIRMED" && item.field === "secondaryServices" && Array.isArray(item.value))
    .flatMap((item) => item.value)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (primaryService && typeof primaryService.value === "string") {
    updates.selectedService = primaryService.value;
    confirmed.add("selectedService");
  }
  if (secondaryServices.length) {
    updates.selectedServices = [...new Set([typeof primaryService?.value === "string" ? primaryService.value.trim().toUpperCase() : "", ...secondaryServices].filter(Boolean))];
  }
  for (const item of decision.fields) {
    if (item.confidence !== "CONFIRMED") continue;
    if (item.field === "name" && typeof item.value === "string") {
      updates.customerName = item.value;
      updates.preferredName = item.value;
      updates.preferredNameConfirmed = true;
      updates.nameSource = "EXPLICIT";
      confirmed.add("customerName");
    }
    if (item.field === "eventType" && typeof item.value === "string") { updates.eventType = item.value; confirmed.add("eventType"); }
    if (item.field === "eventDate" && typeof item.value === "string") { updates.eventDate = item.value; confirmed.add("eventDate"); }
    if (item.field === "attendees" && typeof item.value === "number") { updates.estimatedGuests = item.value; confirmed.add("estimatedGuests"); }
    if (["venue", "commune", "city"].includes(item.field) && typeof item.value === "string") locationParts.push(item.value);
  }
  if (locationParts.length) { updates.eventLocation = [...new Set(locationParts)].join(", "); confirmed.add("eventLocation"); }
  return { updates, confirmed: [...confirmed] };
}

async function persistAiDecision(
  client: SupabaseClient,
  customerId: string,
  conversationState: ConversationStateRow,
  baseMemoryContext: Record<string, unknown>,
  decision: WhatsAppAiDecision,
  occurredAt: string,
) {
  const canonical = canonicalMemoryUpdates(decision, occurredAt);
  const priorConfirmed = Array.isArray(baseMemoryContext.confirmedFields) ? baseMemoryContext.confirmedFields.filter((item): item is string => typeof item === "string") : [];
  const memoryContext = {
    ...baseMemoryContext,
    ...canonical.updates,
    confirmedFields: [...new Set([...priorConfirmed, ...canonical.confirmed])],
    whatsappAi: {
      summary: decision.conversationSummary,
      commercialStage: decision.commercialStage,
      intents: decision.intents,
      fields: decision.fields,
      requestedAction: decision.requestedAction,
      catalogCategory: decision.catalogCategory,
      waitForMoreData: decision.waitForMoreData,
      updatedAt: occurredAt,
    },
  };
  const { error: memoryError } = await client.from("customer_memory").upsert({
    customer_id: customerId,
    context: memoryContext,
    updated_at: new Date().toISOString(),
  }, { onConflict: "customer_id" });
  if (memoryError) throw memoryError;

  const { error: stateError } = await client.from("conversation_states").update({
    context: {
      ...conversationState.context,
      whatsappAi: memoryContext.whatsappAi,
    },
    updated_at: new Date().toISOString(),
  }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", conversationState.id);
  if (stateError) throw stateError;
}

function responseAfterCatalog(result: WhatsAppCatalogDeliveryResult, fallback: string) {
  if (result.status === "SENT" || result.status === "ALREADY_SENT") {
    const emailNote = result.email ? ` También te lo enviamos al correo ${result.email}.` : "";
    return `Sí 😊 Te dejo acá el catálogo: ${result.catalogUrl}${emailNote}`;
  }
  if (result.status === "MISSING_EMAIL")
    return `Sí 😊 Te dejo acá el catálogo: ${result.catalogUrl}\n\nSi quieres que también te lo envíe por correo, ¿qué dirección usamos?`;
  if (result.status === "FAILED")
    return "Perfecto, ya tengo tus datos. Voy a revisar el envío y te confirmamos por acá.";
  return fallback;
}

export async function processWhatsAppWebhookEvent(providerMessageId: string) {
  const client = createAdminClient();
  const orchestrator = new BiancaAgentOrchestrator(client);
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
  if (!claimed) {
    logWhatsApp("info", "whatsapp_event_duplicate", providerMessageId, { provider: "META_CLOUD_API" });
    return { ok: true as const, skipped: true as const };
  }

  const event = claimed as WebhookEventRow;
  try {
    if (event.message_type !== "text" || !event.text_body?.trim()) {
      await client.from("whatsapp_webhook_events").update({ processing_status: "UNSUPPORTED", updated_at: new Date().toISOString() }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", event.id);
      return { ok: true as const, unsupported: true as const };
    }

    // WhatsApp automation is never sufficient by itself. BIANCA customer
    // messaging is a separate, server-side, fail-closed gate.
    const shadowMode = biancaShadowModeEnabled();
    const safeReplyMode = biancaSafeReplyConfiguration().stage === "SAFE_REPLY" && biancaSafeReplyConfiguration().realResponseEnabled && !shadowMode;
    const globalAutomationEnabled = whatsappAutomationEnabled() && biancaCanProcessCustomerMessage();
    const initialRouting = biancaAutomationRouting({ shadowMode, safeReplyMode, globalAutomationEnabled, qaAuthorized: false });
    const initialAutomationEnabled = initialRouting.initialAutomationEnabled;
    const customer = await resolveCustomer(client, event);
    const conversationState = await resolveConversation(client, customer.id, event.sender_wa_id, event.occurred_at, initialAutomationEnabled);
    const qaAuthorized = biancaQaModeEnabled() && biancaCanProcessCustomerMessage(conversationState.id, event.sender_wa_id);
    const routing = biancaAutomationRouting({ shadowMode, safeReplyMode, globalAutomationEnabled, qaAuthorized });
    const automationEnabled = routing.automationEnabled;
    await persistInboundCommunication(client, event, conversationState.id, customer.id);

    // Shadow Mode intentionally bypasses the legacy if (!automationEnabled)
    // customer handoff branch while keeping that branch fail-closed normally.
    if (!automationEnabled && !shadowMode) {
      const { error: stateError } = await client.from("conversation_states").update({
        status: "HUMAN_HANDOFF",
        nova_enabled: false,
        context: {
          ...conversationState.context,
          channel: "WHATSAPP_BUSINESS",
          externalParticipantId: event.sender_wa_id,
          lastInboundMessageId: event.provider_message_id,
          lastMessageAt: event.occurred_at,
        },
        updated_at: new Date().toISOString(),
      }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", conversationState.id);
      if (stateError) throw stateError;
      const { error: finishError } = await client.from("whatsapp_webhook_events").update({
        processing_status: "PROCESSED",
        customer_id: customer.id,
        conversation_id: conversationState.id,
        processing_error: null,
        updated_at: new Date().toISOString(),
      }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", event.id);
      if (finishError) throw finishError;
      logWhatsApp("info", "whatsapp_event_processed", providerMessageId, { outcome: "HUMAN_REVIEW", automation: "DISABLED" });
      return { ok: true as const, suppressed: true as const, customerId: customer.id, conversationId: conversationState.id, finalStatus: "HUMAN_HANDOFF" as const };
    }

    const memoryState = await loadMemory(client, customer.id, customer.full_name);
    const opportunity = prepareBiancaOpportunityContext(memoryState.context, event.text_body, event.occurred_at);
    const activeMemory = memoryRecord(customer.id, customer.full_name, opportunity.context);
    const history = await loadConversationHistory(client, conversationState.id);
    const memoryEngine = new CustomerMemoryEngine(ORBIT_TIME_ENGINE);
    const aiResponder = new WhatsAppAiResponder(new NovaChannelEngine(memoryEngine), opportunity.reset ? [] : history, client);
    const engine = new CommunicationHubEngine(
      aiResponder,
      new SupabaseCommunicationTimelineRepository(client),
      shadowMode || safeReplyMode ? new ShadowWhatsAppDispatcher() : new QueuedWhatsAppDispatcher(client, customer.id),
    );
    const qaOverride = qaAuthorized || shadowMode;
    const current = currentConversation(conversationState, customer.full_name, event.occurred_at, qaOverride);
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
      { memory: activeMemory },
      current,
    );

    const decision = aiResponder.lastDecision;
    if (shadowMode && decision) {
      const plan = planBiancaTurn({
        text: event.text_body,
        known: {
          preferredName: activeMemory.customerName,
          eventType: activeMemory.eventType,
          eventDate: activeMemory.eventDate,
          commune: activeMemory.eventLocation,
          serviceCodes: activeMemory.selectedServices ?? (activeMemory.selectedService ? [activeMemory.selectedService] : []),
          priceResolved: Boolean(activeMemory.quotationStatus),
        },
      });
      const actualResponse = [...history].reverse().find((item) => item.direction === "OUTBOUND")?.body ?? null;
      const shadowDecision = createBiancaShadowDecision({
        conversationId: conversationState.id,
        customerId: customer.id,
        clientMessage: event.text_body,
        actualResponse,
        detectedIntents: plan.intents,
        intent: plan.intent,
        plan,
        proposedResponse: decision.responseText,
        confidence: shadowConfidence(decision),
        proposedTools: [decision.requestedAction, ...(decision.catalogCategory !== "NONE" ? [`CATALOG_${decision.catalogCategory}`] : [])],
        handoffReason: decision.requestedAction === "HUMAN_HANDOFF" || decision.requestedAction === "MANUAL_REVIEW" ? decision.requestedAction : null,
        recordedAt: event.occurred_at,
      });
      await persistBiancaShadowDecision({ client, providerMessageId: event.provider_message_id, webhookEventId: event.id, decision: shadowDecision });
      const { error: shadowStateError } = await client.from("conversation_states").update({
        context: { ...conversationState.context, shadowLastDecision: { status: "SHADOW_PROPOSED", proposedAction: shadowDecision.proposedAction, detectedIntents: shadowDecision.detectedIntents, confidence: shadowDecision.confidence, updatedAt: event.occurred_at } },
        updated_at: new Date().toISOString(),
      }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", conversationState.id);
      if (shadowStateError) throw shadowStateError;
      const { error: shadowFinishError } = await client.from("whatsapp_webhook_events").update({
        processing_status: "PROCESSED",
        customer_id: customer.id,
        conversation_id: conversationState.id,
        processing_error: null,
        updated_at: new Date().toISOString(),
      }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", event.id);
      if (shadowFinishError) throw shadowFinishError;
      logWhatsApp("info", "whatsapp_shadow_decision_recorded", providerMessageId, { conversationId: conversationState.id, customerId: customer.id, proposedAction: shadowDecision.proposedAction, status: shadowDecision.status });
      return { ok: true as const, shadow: true as const, suppressed: true as const, customerId: customer.id, conversationId: conversationState.id, finalStatus: "SHADOW_PROPOSED" as const };
    }
    if (safeReplyMode && decision) {
      const evidence = await resolveCanonicalBiancaSafeReplyEvidence({
        client,
        decision,
        messageText: event.text_body,
        known: {
          eventDate: activeMemory.eventDate,
          durationHours: activeMemory.recommendedHours,
          serviceCodes: activeMemory.selectedServices ?? (activeMemory.selectedService ? [activeMemory.selectedService] : []),
          commune: activeMemory.eventLocation,
        },
      });
      const finalSafeReply = evidence.kind === "CANONICAL_CATALOG" && evidence.sourceRef
        ? `Sí 😊 Te dejo nuestro catálogo: ${evidence.sourceRef}`
        : result.nova.response;
      const claimViolations = orchestrator.verifyResponse(finalSafeReply, {
        catalogSent: evidence.kind === "CANONICAL_CATALOG",
        priceResolved: evidence.kind === "CANONICAL_PRICE",
        availability: evidence.kind === "CANONICAL_AVAILABILITY" ? evidence.availability : undefined,
      });
      const evaluation = evaluateBiancaSafeReply({
        decision,
        response: finalSafeReply,
        confidence: shadowConfidence(decision),
        evidence,
        claimViolations,
      });
      const outgoingReply = evaluation.allowed ? finalSafeReply : null;
      if (evaluation.allowed) {
        await new QueuedWhatsAppDispatcher(client, customer.id).dispatch({ ...result.dispatch, content: finalSafeReply });
        await persistOutboundCommunication(client, conversationState.id, customer.id, finalSafeReply, event.occurred_at, result.dispatch.correlationId);
      }
      await persistBiancaSafeReply({
        client,
        webhookEventId: event.id,
        providerMessageId: event.provider_message_id,
        conversationId: conversationState.id,
        customerId: customer.id,
        inboundMessage: event.text_body,
        decision,
        confidence: shadowConfidence(decision),
        evaluation,
        outgoingReply,
        handoffStatus: evaluation.handoffRequired ? "REQUIRED" : "NONE",
      });
      const safeFinalStatus = evaluation.handoffRequired ? "HUMAN_HANDOFF" : result.conversation.status;
      const { error: safeStateError } = await client.from("conversation_states").update({
        status: safeFinalStatus,
        nova_enabled: !evaluation.handoffRequired,
        context: { ...conversationState.context, safeReply: { status: evaluation.allowed ? "SENT" : "BLOCKED", guardDecisions: evaluation.guardDecisions, updatedAt: event.occurred_at } },
        updated_at: new Date().toISOString(),
      }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", conversationState.id);
      if (safeStateError) throw safeStateError;
      const { error: safeFinishError } = await client.from("whatsapp_webhook_events").update({
        processing_status: "PROCESSED",
        customer_id: customer.id,
        conversation_id: conversationState.id,
        processing_error: null,
        updated_at: new Date().toISOString(),
      }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", event.id);
      if (safeFinishError) throw safeFinishError;
      logWhatsApp(evaluation.allowed ? "info" : "warn", evaluation.allowed ? "bianca_safe_reply_allowed" : "bianca_safe_reply_blocked", providerMessageId, { conversationId: conversationState.id, customerId: customer.id, status: evaluation.allowed ? "SENT" : "BLOCKED", reason: evaluation.reason, evidenceKind: evidence.kind, confidenceBand: evaluation.confidenceBand });
      return { ok: true as const, safeReply: evaluation.allowed, suppressed: !evaluation.allowed, customerId: customer.id, conversationId: conversationState.id, finalStatus: safeFinalStatus };
    }
    if (!result.suppressed && decision)
      await persistAiDecision(client, customer.id, conversationState, opportunity.context, decision, event.occurred_at);

    let finalResponse = result.nova.response;
    let commercialAction: Record<string, unknown> | null = null;
    let forcedHumanReview = false;

    if (!result.suppressed && decision) {
      const catalogResult = await orchestrator.sendCatalog({
        decision,
        customerId: customer.id,
        customerName: customer.full_name,
        customerEmail: customer.email,
        providerMessageId: event.provider_message_id,
      });
      finalResponse = responseAfterCatalog(catalogResult, finalResponse);
      const claimViolations = orchestrator.verifyResponse(finalResponse, {
        catalogSent: catalogResult.status === "SENT" || catalogResult.status === "ALREADY_SENT" || catalogResult.status === "MISSING_EMAIL",
        emailSent: catalogResult.status === "SENT" || catalogResult.status === "ALREADY_SENT" ? Boolean(catalogResult.email) : false,
      });
      if (claimViolations.length) {
        finalResponse = "No pude completar esa acción de forma segura. Dejé la conversación lista para que nuestro equipo la revise.";
        forcedHumanReview = true;
        logWhatsApp("warn", "bianca_unsupported_claim_blocked", event.provider_message_id, { claimViolations });
      }
      commercialAction = { type: decision.requestedAction, catalogCategory: decision.catalogCategory, result: catalogResult.status, updatedAt: new Date().toISOString() };
      forcedHumanReview ||= decision.requestedAction === "MANUAL_REVIEW" || catalogResult.status === "FAILED";
      if (finalResponse !== result.nova.response)
        await replaceQueuedWhatsAppResponse(client, event.provider_message_id, finalResponse);
    }

    const finalStatus = result.suppressed || result.conversation.status === "HUMAN_HANDOFF" || forcedHumanReview
      ? "HUMAN_HANDOFF"
      : result.conversation.status;
    const novaEnabled = finalStatus !== "HUMAN_HANDOFF";

    const { error: conversationUpdateError } = await client.from("conversation_states").update({
      status: finalStatus,
      nova_enabled: novaEnabled,
      human_owner_id: result.conversation.assignedHuman ?? null,
      context: {
        ...conversationState.context,
        ...(decision ? { whatsappAi: {
          summary: decision.conversationSummary,
          commercialStage: decision.commercialStage,
          intents: decision.intents,
          fields: decision.fields,
          requestedAction: decision.requestedAction,
          catalogCategory: decision.catalogCategory,
          waitForMoreData: decision.waitForMoreData,
          updatedAt: event.occurred_at,
        } } : {}),
        ...(commercialAction ? { commercialAction } : {}),
        channel: "WHATSAPP_BUSINESS",
        externalParticipantId: event.sender_wa_id,
        lastInboundMessageId: event.provider_message_id,
        lastMessageAt: event.occurred_at,
      },
      updated_at: new Date().toISOString(),
    }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", conversationState.id);
    if (conversationUpdateError) throw conversationUpdateError;

    if (!result.suppressed)
      await persistOutboundCommunication(client, conversationState.id, customer.id, finalResponse, event.occurred_at, event.provider_message_id);

    const { error: finishError } = await client.from("whatsapp_webhook_events").update({
      processing_status: "PROCESSED",
      customer_id: customer.id,
      conversation_id: conversationState.id,
      processing_error: null,
      updated_at: new Date().toISOString(),
    }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", event.id);
    if (finishError) throw finishError;

    logWhatsApp("info", "whatsapp_event_processed", providerMessageId, { outcome: finalStatus });

    return { ok: true as const, suppressed: Boolean(result.suppressed), customerId: customer.id, conversationId: conversationState.id, finalStatus };
  } catch (error) {
    const detail = serializeWhatsAppError(error);
    await client.from("whatsapp_webhook_events").update({
      processing_status: "FAILED",
      processing_error: detail.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("tenant_slug", WHATSAPP_TENANT_SLUG).eq("id", event.id);
    logWhatsApp("error", "whatsapp_event_processing_failed", providerMessageId, { detail });
    return { ok: false as const, error: detail };
  }
}

const WHATSAPP_TURN_DEBOUNCE_MS = 3_500;
type DebouncedTurn = {
  providerMessageIds: Set<string>;
  waiters: Map<string, Array<(result: Awaited<ReturnType<typeof processWhatsAppWebhookEvent>>) => void>>;
  timer: ReturnType<typeof setTimeout>;
};
const debouncedTurns = new Map<string, DebouncedTurn>();

/**
 * Gives consecutive inbound messages a short coalescing window before invoking
 * the AI. The webhook has already persisted every message, so the responder
 * sees the complete recent turn history. Isolated acknowledgements are then
 * intentionally silent and the substantive follow-up is answered once.
 */
export async function processWhatsAppWebhookEventDebounced(providerMessageId: string) {
  const client = createAdminClient();
  const { data: event } = await client
    .from("whatsapp_webhook_events")
    .select("sender_wa_id")
    .eq("tenant_slug", WHATSAPP_TENANT_SLUG)
    .eq("provider", "META_CLOUD_API")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  const key = typeof event?.sender_wa_id === "string" && event.sender_wa_id.trim() ? event.sender_wa_id : providerMessageId;
  return new Promise<Awaited<ReturnType<typeof processWhatsAppWebhookEvent>>>((resolve) => {
    const existing = debouncedTurns.get(key);
    if (existing) {
      existing.providerMessageIds.add(providerMessageId);
      const waiters = existing.waiters.get(providerMessageId) ?? [];
      waiters.push(resolve);
      existing.waiters.set(providerMessageId, waiters);
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => flushDebouncedTurn(key), WHATSAPP_TURN_DEBOUNCE_MS);
      return;
    }
    const waiters = new Map<string, Array<(result: Awaited<ReturnType<typeof processWhatsAppWebhookEvent>>) => void>>();
    waiters.set(providerMessageId, [resolve]);
    const turn: DebouncedTurn = {
      providerMessageIds: new Set([providerMessageId]),
      waiters,
      timer: setTimeout(() => flushDebouncedTurn(key), WHATSAPP_TURN_DEBOUNCE_MS),
    };
    debouncedTurns.set(key, turn);
  });
}

async function flushDebouncedTurn(key: string) {
  const turn = debouncedTurns.get(key);
  if (!turn) return;
  debouncedTurns.delete(key);
  for (const providerMessageId of turn.providerMessageIds) {
    const result = await processWhatsAppWebhookEvent(providerMessageId);
    for (const resolve of turn.waiters.get(providerMessageId) ?? []) resolve(result);
  }
}

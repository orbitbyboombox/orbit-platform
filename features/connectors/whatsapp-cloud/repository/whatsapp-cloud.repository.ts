import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppWebhookEvent } from "../application/whatsapp-webhook";

export interface WhatsAppConversationIdentity {
  customerId: string;
  conversationId: string;
  customerName: string;
  humanHandoff: boolean;
  novaEnabled: boolean;
}

function digits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

export class WhatsAppCloudRepository {
  constructor(private readonly client: SupabaseClient) {}

  async claimWebhookEvent(event: WhatsAppWebhookEvent): Promise<boolean> {
    const { error } = await this.client.from("whatsapp_webhook_events").insert({
      provider_event_id: event.providerEventId,
      event_kind: event.kind,
      wa_id: event.waId ?? null,
      phone_number_id: event.phoneNumberId,
      payload: event.payload,
      processing_status: "RECEIVED",
      received_at: new Date().toISOString(),
    });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw error;
  }

  async markWebhookEvent(providerEventId: string, status: "PROCESSED" | "IGNORED" | "FAILED", error?: unknown) {
    const { error: updateError } = await this.client
      .from("whatsapp_webhook_events")
      .update({
        processing_status: status,
        processed_at: new Date().toISOString(),
        last_error: error ? String(error instanceof Error ? error.message : error) : null,
      })
      .eq("provider_event_id", providerEventId);
    if (updateError) throw updateError;
  }

  async ensureIdentity(event: Extract<WhatsAppWebhookEvent, { kind: "MESSAGE" }>): Promise<WhatsAppConversationIdentity> {
    const { data: linked, error: linkedError } = await this.client
      .from("whatsapp_identities")
      .select("customer_id")
      .eq("wa_id", event.waId)
      .maybeSingle();
    if (linkedError) throw linkedError;

    let customerId = linked?.customer_id as string | undefined;
    let customerName = event.profileName?.trim() || `WhatsApp +${event.waId}`;

    if (!customerId) {
      const { data: customers, error: customersError } = await this.client
        .from("customers")
        .select("id,full_name,phone")
        .is("deleted_at", null)
        .limit(5000);
      if (customersError) throw customersError;
      const match = (customers ?? []).find((customer) => digits(customer.phone) === digits(event.waId));
      if (match) {
        customerId = match.id;
        customerName = match.full_name || customerName;
      } else {
        const { data: created, error: createError } = await this.client
          .from("customers")
          .insert({
            full_name: customerName,
            phone: `+${event.waId}`,
            metadata: { leadSource: "WHATSAPP_BUSINESS", whatsappWaId: event.waId },
          })
          .select("id,full_name")
          .single();
        if (createError) throw createError;
        customerId = created.id;
        customerName = created.full_name;
      }

      const { error: identityError } = await this.client.from("whatsapp_identities").insert({
        wa_id: event.waId,
        customer_id: customerId,
        phone_number_id: event.phoneNumberId,
        profile_name: event.profileName ?? null,
      });
      if (identityError && identityError.code !== "23505") throw identityError;
    } else {
      const { data: customer, error: customerError } = await this.client
        .from("customers")
        .select("full_name")
        .eq("id", customerId)
        .maybeSingle();
      if (customerError) throw customerError;
      customerName = customer?.full_name || customerName;
      const { error: updateIdentityError } = await this.client
        .from("whatsapp_identities")
        .update({ phone_number_id: event.phoneNumberId, profile_name: event.profileName ?? null, updated_at: new Date().toISOString() })
        .eq("wa_id", event.waId);
      if (updateIdentityError) throw updateIdentityError;
    }

    const { data: existingState, error: stateError } = await this.client
      .from("conversation_states")
      .select("id,status,nova_enabled,human_owner_id,context")
      .eq("customer_id", customerId)
      .maybeSingle();
    if (stateError) throw stateError;

    if (existingState) {
      const context = (existingState.context ?? {}) as Record<string, unknown>;
      const { error: touchError } = await this.client
        .from("conversation_states")
        .update({
          context: {
            ...context,
            channel: "WHATSAPP_BUSINESS",
            externalParticipantId: event.waId,
            whatsappPhoneNumberId: event.phoneNumberId,
            whatsappProfileName: event.profileName ?? context.whatsappProfileName,
          },
        })
        .eq("id", existingState.id);
      if (touchError) throw touchError;
      return {
        customerId,
        conversationId: existingState.id,
        customerName,
        humanHandoff: existingState.status === "HUMAN_HANDOFF" || Boolean(existingState.human_owner_id),
        novaEnabled: Boolean(existingState.nova_enabled),
      };
    }

    const now = event.occurredAt;
    const { data: createdState, error: createStateError } = await this.client
      .from("conversation_states")
      .insert({
        customer_id: customerId,
        status: "ACTIVE",
        nova_enabled: true,
        context: {
          channel: "WHATSAPP_BUSINESS",
          externalParticipantId: event.waId,
          whatsappPhoneNumberId: event.phoneNumberId,
          whatsappProfileName: event.profileName ?? null,
          startedAt: now,
        },
      })
      .select("id")
      .single();
    if (createStateError) throw createStateError;
    return { customerId, conversationId: createdState.id, customerName, humanHandoff: false, novaEnabled: true };
  }

  async recordInboundText(event: Extract<WhatsAppWebhookEvent, { kind: "MESSAGE" }>, identity: WhatsAppConversationIdentity) {
    const { error } = await this.client.from("communications").insert({
      customer_id: identity.customerId,
      channel: "WHATSAPP_BUSINESS",
      direction: "INBOUND",
      communication_type: "CUSTOMER_REPLY",
      thread_key: identity.conversationId,
      body: event.text ?? "",
      status: "RECEIVED",
      external_message_id: event.providerEventId,
      occurred_at: event.occurredAt,
    });
    if (error) throw error;
  }

  async recordOutboundText(input: { customerId: string; conversationId: string; body: string; messageId: string; occurredAt?: string }) {
    const { error } = await this.client.from("communications").insert({
      customer_id: input.customerId,
      channel: "WHATSAPP_BUSINESS",
      direction: "OUTBOUND",
      communication_type: "NOVA_RESPONSE",
      thread_key: input.conversationId,
      body: input.body,
      status: "SENT",
      external_message_id: input.messageId,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    });
    if (error) throw error;
  }

  async applyDeliveryStatus(event: Extract<WhatsAppWebhookEvent, { kind: "STATUS" }>) {
    const { error } = await this.client
      .from("communications")
      .update({ status: event.status.toUpperCase() })
      .eq("channel", "WHATSAPP_BUSINESS")
      .eq("external_message_id", event.messageId);
    if (error) throw error;
  }

  async log(level: "info" | "error", operation: string, correlationId: string, message: string, metadata: Record<string, unknown> = {}) {
    const { error } = await this.client.from("connector_logs").insert({
      connector: "WHATSAPP_CLOUD",
      operation,
      correlation_id: correlationId,
      level,
      message,
      metadata,
    });
    if (error) console.error("WhatsApp connector log persistence failed", error);
  }
}

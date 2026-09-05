import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelDispatchRequest,
  CommunicationChannelDispatcher,
} from "@/features/communication-hub";

export class QueuedWhatsAppDispatcher implements CommunicationChannelDispatcher {
  constructor(
    private readonly client: SupabaseClient,
    private readonly customerId: string,
  ) {}

  async dispatch(request: ChannelDispatchRequest): Promise<void> {
    if (request.channel !== "WHATSAPP_BUSINESS")
      throw new Error(`QueuedWhatsAppDispatcher cannot dispatch ${request.channel}.`);
    if (!request.content.trim()) return;

    const { error } = await this.client.from("whatsapp_outbound_messages").upsert(
      {
        correlation_id: request.correlationId,
        conversation_id: request.conversationId,
        customer_id: this.customerId,
        recipient_wa_id: request.participantId,
        message_type: "text",
        text_body: request.content,
        status: "PENDING",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "correlation_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
}

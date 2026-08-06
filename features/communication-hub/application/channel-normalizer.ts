import type { NovaChannel } from "@/features/nova-channel";
import type { ChannelCommunicationEnvelope, CommunicationChannel, NormalizedCommunication } from "../types/communication-hub.types";

export function normalizeChannelCommunication(envelope: ChannelCommunicationEnvelope): NormalizedCommunication {
  return { id: envelope.id, channel: envelope.channel, conversationId: envelope.conversationId, customerId: envelope.customerId, participantId: envelope.externalParticipantId, content: envelope.content.trim(), direction: "INBOUND", occurredAt: envelope.occurredAt, confirmedInformation: envelope.confirmedInformation };
}

export function toNovaChannel(channel: CommunicationChannel): NovaChannel {
  const mapping: Record<CommunicationChannel, NovaChannel> = { GOOGLE_GMAIL: "EMAIL_ASSISTANT", WHATSAPP_BUSINESS: "WHATSAPP_BUSINESS", INSTAGRAM_DIRECT: "INSTAGRAM_DIRECT", WEB_CHAT: "WEB_CHAT", PHONE_LOG: "FUTURE", FUTURE: "FUTURE" };
  return mapping[channel];
}

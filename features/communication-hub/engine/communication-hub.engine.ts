import { NovaChannelEngine, releaseHumanHandoff, requestHumanHandoff, type NovaConversationState } from "@/features/nova-channel";
import { normalizeChannelCommunication, toNovaChannel } from "../application/channel-normalizer";
import type { CommunicationChannelDispatcher } from "../application/channel-dispatcher";
import type { CommunicationTimelineRepository } from "../timeline/unified-communication.timeline";
import { newestFirst } from "../timeline/unified-communication.timeline";
import type { ChannelCommunicationEnvelope, CommunicationHubContext, CommunicationHubResult, UnifiedCommunicationEvent, UnifiedConversation } from "../types/communication-hub.types";

export class CommunicationHubEngine {
  constructor(private readonly nova: NovaChannelEngine, private readonly timeline: CommunicationTimelineRepository, private readonly dispatcher: CommunicationChannelDispatcher) {}

  async receive(envelope: ChannelCommunicationEnvelope, context: CommunicationHubContext, current?: UnifiedConversation): Promise<CommunicationHubResult> {
    const communication = normalizeChannelCommunication(envelope);
    const novaState = current?.novaState ?? this.createNovaState(envelope);
    const receivedEvent: UnifiedCommunicationEvent = { id: `${communication.id}-received`, conversationId: communication.conversationId, customerId: communication.customerId, channel: communication.channel, direction: "INBOUND", type: current ? "CUSTOMER_REPLY" : "CONVERSATION_STARTED", occurredAt: communication.occurredAt, summary: communication.content };
    await this.timeline.append(receivedEvent);

    // Founder/staff takeover is a hard backend gate. While active we keep recording
    // inbound messages and context, but NOVA is not invoked and nothing is dispatched.
    if (novaState.humanHandoff || current?.status === "HUMAN_HANDOFF") {
      const handledBy = current?.assignedHuman ?? novaState.handledBy ?? "BOOMBOX";
      const conversation: UnifiedConversation = {
        id: communication.conversationId,
        customerId: communication.customerId,
        customerName: context.memory.customerName,
        status: "HUMAN_HANDOFF",
        novaState: {
          ...novaState,
          status: "HUMAN_HANDOFF",
          humanHandoff: true,
          handledBy,
          lastMessageAt: communication.occurredAt,
        },
        assignedHuman: handledBy,
        lastChannel: communication.channel,
        lastInteractionAt: communication.occurredAt,
      };

      return {
        nova: {
          response: "",
          nextRecommendedAction: "WAIT_FOR_HUMAN",
          conversationStatus: "HUMAN_HANDOFF",
          timelineEvent: {
            id: `${communication.id}-human-handoff-suppressed`,
            conversationId: communication.conversationId,
            customerId: communication.customerId,
            type: "HUMAN_HANDOFF_REQUESTED",
            occurredAt: communication.occurredAt,
            description: `NOVA suprimida mientras ${handledBy} mantiene el control humano.`,
          },
        },
        conversation,
        events: newestFirst([...(await this.timeline.getByCustomerId(communication.customerId))]),
        dispatch: {
          channel: communication.channel,
          conversationId: communication.conversationId,
          participantId: communication.participantId,
          content: "",
          correlationId: communication.id,
        },
        suppressed: true,
        suppressionReason: "HUMAN_HANDOFF",
      };
    }

    const nova = this.nova.respond({ message: { id: communication.id, channel: toNovaChannel(communication.channel), conversationId: communication.conversationId, customerId: communication.customerId, senderExternalId: communication.participantId, text: communication.content, receivedAt: communication.occurredAt, confirmedInformation: communication.confirmedInformation }, memory: context.memory, conversation: novaState, operationsRecommendation: context.operationsRecommendation, profitRecommendation: context.profitRecommendation });
    const responseEvent: UnifiedCommunicationEvent = { id: `${communication.id}-nova-response`, conversationId: communication.conversationId, customerId: communication.customerId, channel: communication.channel, direction: "OUTBOUND", type: "NOVA_RESPONSE", occurredAt: communication.occurredAt, summary: nova.response };
    await this.timeline.append(responseEvent);

    const conversation: UnifiedConversation = { id: communication.conversationId, customerId: communication.customerId, customerName: context.memory.customerName, status: nova.conversationStatus === "HUMAN_HANDOFF" ? "HUMAN_HANDOFF" : nova.conversationStatus === "WAITING_CUSTOMER" ? "WAITING_CUSTOMER" : "ACTIVE", novaState: { ...novaState, status: nova.conversationStatus, lastMessageAt: communication.occurredAt }, assignedHuman: current?.assignedHuman, lastChannel: communication.channel, lastInteractionAt: communication.occurredAt };
    const dispatch = { channel: communication.channel, conversationId: communication.conversationId, participantId: communication.participantId, content: nova.response, correlationId: communication.id };
    await this.dispatcher.dispatch(dispatch);
    return { nova, conversation, events: newestFirst([...(await this.timeline.getByCustomerId(communication.customerId))]), dispatch };
  }

  async takeConversation(conversation: UnifiedConversation, staffName: string, occurredAt: string) {
    const handoff = requestHumanHandoff(conversation.novaState, occurredAt, staffName);
    const event: UnifiedCommunicationEvent = { id: handoff.timelineEvent.id, conversationId: conversation.id, customerId: conversation.customerId, channel: conversation.lastChannel, direction: "SYSTEM", type: "HUMAN_HANDOFF", occurredAt, summary: `Conversación tomada por ${staffName}. NOVA queda pausada hasta liberación explícita.` };
    await this.timeline.append(event);
    return { ...conversation, status: "HUMAN_HANDOFF" as const, novaState: handoff.conversation, assignedHuman: staffName, lastInteractionAt: occurredAt };
  }

  async releaseConversation(conversation: UnifiedConversation, occurredAt: string) {
    const handoff = releaseHumanHandoff(conversation.novaState, occurredAt);
    const event: UnifiedCommunicationEvent = { id: handoff.timelineEvent.id, conversationId: conversation.id, customerId: conversation.customerId, channel: conversation.lastChannel, direction: "SYSTEM", type: "HUMAN_HANDOFF_RELEASED", occurredAt, summary: "Conversación devuelta a NOVA con su contexto intacto." };
    await this.timeline.append(event);
    return { ...conversation, status: "ACTIVE" as const, novaState: handoff.conversation, assignedHuman: undefined, lastInteractionAt: occurredAt };
  }

  resumeNova(conversation: UnifiedConversation, occurredAt: string) { return this.releaseConversation(conversation, occurredAt); }

  private createNovaState(envelope: ChannelCommunicationEnvelope): NovaConversationState {
    return { conversationId: envelope.conversationId, customerId: envelope.customerId, channel: toNovaChannel(envelope.channel), status: "ACTIVE", humanHandoff: false, startedAt: envelope.occurredAt, lastMessageAt: envelope.occurredAt };
  }
}

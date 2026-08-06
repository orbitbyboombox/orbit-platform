import type { CustomerMemoryEngine, CustomerMemoryRecord } from "@/features/customer-memory";
import { ORBIT_COMMUNICATION_BIBLE, type CommunicationBible } from "../rules/communication-bible";
import { actionForMissingField, getCatalogServiceRecommendation, getFirstMissingCommercialField, NOVA_COMMERCIAL_QUESTIONS, recommendHours } from "../rules/nova-commercial-flow.rules";
import type { NovaChannelInput, NovaChannelOutput, NovaConversationState, NovaNextAction, NovaTimelineEventType } from "../types/nova-channel.types";

interface NovaStep { response: string; action: NovaNextAction; status: NovaChannelOutput["conversationStatus"]; eventType: NovaTimelineEventType; }

export class NovaChannelEngine {
  constructor(private readonly memoryEngine: CustomerMemoryEngine, private readonly bible: CommunicationBible = ORBIT_COMMUNICATION_BIBLE) {}

  respond(input: NovaChannelInput): NovaChannelOutput {
    const { message } = input;
    const conversation = input.conversation ?? this.createConversation(input);
    if (conversation.humanHandoff) return this.output(input, { response: "El equipo BOOMBOX continuará contigo desde aquí.", action: "WAIT_FOR_HUMAN", status: "HUMAN_HANDOFF", eventType: "HUMAN_HANDOFF_REQUESTED" });

    const memory = this.applyNormalizedInformation(input.memory, message.confirmedInformation);
    const context = this.memoryEngine.createContext(memory);
    const missing = getFirstMissingCommercialField(memory);
    if (missing) return this.output(input, { response: NOVA_COMMERCIAL_QUESTIONS[missing], action: actionForMissingField(missing), status: "WAITING_CUSTOMER", eventType: input.conversation ? "INFORMATION_REQUESTED" : "CONVERSATION_STARTED" });

    if (memory.recommendedHours === undefined) {
      const hours = recommendHours(memory.estimatedGuests as number);
      return this.output(input, { response: `Para ${memory.estimatedGuests} invitados te recomiendo ${hours} horas.`, action: "RECOMMEND_HOURS", status: "ACTIVE", eventType: "HOURS_RECOMMENDED" });
    }
    if (!memory.selectedService) {
      const service = getCatalogServiceRecommendation();
      return this.output(input, { response: `Como punto de partida te recomiendo ${service.name}.`, action: "RECOMMEND_SERVICE", status: "ACTIVE", eventType: "SERVICE_RECOMMENDED" });
    }
    if (context.quotationStatus === "NOT_STARTED") return this.output(input, { response: "Ya tengo lo necesario para preparar tu cotización.", action: "GENERATE_QUOTATION", status: "READY_FOR_QUOTATION", eventType: "QUOTATION_REQUESTED" });
    if (context.quotationStatus === "ACCEPTED" && context.portalStatus === "NOT_CREATED") return this.output(input, { response: "Tu cotización fue aceptada. El siguiente paso es preparar tu portal de reserva.", action: "GENERATE_RESERVATION_PORTAL", status: "READY_FOR_PORTAL", eventType: "RESERVATION_STARTED" });

    const timelineAction = context.timeline?.nextRecommendedAction;
    const operationalAction = input.operationsRecommendation?.actionLabel;
    const profitAction = input.profitRecommendation?.title;
    const next = timelineAction ?? operationalAction ?? profitAction ?? "Continuar con el siguiente paso del proyecto.";
    return this.output(input, { response: next, action: "NONE", status: "ACTIVE", eventType: "INFORMATION_REQUESTED" });
  }

  private applyNormalizedInformation(memory: CustomerMemoryRecord, update: NovaChannelInput["message"]["confirmedInformation"]) {
    if (!update) return memory;
    const result = this.memoryEngine.applyConfirmedInformation(memory, update);
    return result.ok ? result.memory : memory;
  }

  private createConversation(input: NovaChannelInput): NovaConversationState {
    return { conversationId: input.message.conversationId, customerId: input.message.customerId, channel: input.message.channel, status: "ACTIVE", humanHandoff: false, startedAt: input.message.receivedAt, lastMessageAt: input.message.receivedAt };
  }

  private output(input: NovaChannelInput, step: NovaStep): NovaChannelOutput {
    return {
      response: this.bible.format(step.response), nextRecommendedAction: step.action, conversationStatus: step.status,
      timelineEvent: { id: `${input.message.id}-${step.eventType.toLowerCase()}`, conversationId: input.message.conversationId, customerId: input.message.customerId, type: step.eventType, occurredAt: input.message.receivedAt, description: step.response },
    };
  }
}

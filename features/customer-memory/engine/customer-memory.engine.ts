import type { TimeIntelligenceEngine } from "@/features/time-intelligence";
import {
  CUSTOMER_CONVERSATION_FIELD_ORDER,
  CUSTOMER_MEMORY_QUESTIONS,
  INTERNAL_MEMORY_DEFAULTS,
} from "../rules/customer-memory.rules";
import type {
  ConfirmedMemoryUpdate,
  CustomerConversationContext,
  CustomerMemoryField,
  CustomerMemoryRecord,
  CustomerTimelineContext,
  MemoryUpdateResult,
} from "../types/customer-memory.types";

function hasKnownValue(memory: CustomerMemoryRecord, field: CustomerMemoryField): boolean {
  const value = memory[field];
  return value !== undefined && value !== null && value !== "";
}

function uniqueFields(fields: readonly CustomerMemoryField[]): readonly CustomerMemoryField[] {
  return [...new Set(fields)];
}

export class CustomerMemoryEngine {
  constructor(private readonly timeIntelligence: TimeIntelligenceEngine) {}

  applyConfirmedInformation(memory: CustomerMemoryRecord, update: ConfirmedMemoryUpdate): MemoryUpdateResult {
    for (const field of update.confirmedFields) {
      const attemptedValue = update.values[field as keyof typeof update.values];
      if (attemptedValue === undefined) {
        return {
          ok: false,
          memory,
          conflict: { code: "INVALID_CONFIRMED_FIELD", field, attemptedValue },
        };
      }

      if (memory.confirmedFields.includes(field) && hasKnownValue(memory, field) && memory[field] !== attemptedValue) {
        return {
          ok: false,
          memory,
          conflict: {
            code: "CONFIRMED_VALUE_CONFLICT",
            field,
            currentValue: memory[field],
            attemptedValue,
          },
        };
      }
    }

    return {
      ok: true,
      memory: {
        ...memory,
        ...update.values,
        confirmedFields: uniqueFields([...memory.confirmedFields, ...update.confirmedFields]),
      },
    };
  }

  getMissingInformation(memory: CustomerMemoryRecord): readonly CustomerMemoryField[] {
    return CUSTOMER_CONVERSATION_FIELD_ORDER.filter((field) => !hasKnownValue(memory, field));
  }

  getNextQuestion(memory: CustomerMemoryRecord): string | undefined {
    const nextField = this.getMissingInformation(memory)[0];
    return nextField ? CUSTOMER_MEMORY_QUESTIONS[nextField] : undefined;
  }

  getTimelineContext(memory: CustomerMemoryRecord): CustomerTimelineContext | undefined {
    if (!memory.eventDate) return undefined;
    const intelligence = this.timeIntelligence.getEventIntelligence({
      eventDate: memory.eventDate,
      archived: memory.portalStatus === "ARCHIVED",
      completed: memory.portalStatus === "COMPLETED",
    });
    return {
      daysRemaining: intelligence.countdown.days,
      countdownLabel: intelligence.countdown.label,
      currentOperationalPhase: intelligence.timeline.phaseLabel,
      nextRecommendedAction: intelligence.timeline.nextAction,
      intelligence,
    };
  }

  createContext(memory: CustomerMemoryRecord): CustomerConversationContext {
    const { customerId, confirmedFields, ...knownInformation } = memory;
    const missingInformation = this.getMissingInformation(memory);
    return {
      customerId,
      customerName: memory.customerName,
      knownInformation,
      confirmedInformation: uniqueFields(confirmedFields),
      missingInformation,
      nextQuestion: this.getNextQuestion(memory),
      timeline: this.getTimelineContext(memory),
      quotationStatus: memory.quotationStatus ?? INTERNAL_MEMORY_DEFAULTS.quotationStatus,
      reservationStatus: memory.reservationStatus ?? INTERNAL_MEMORY_DEFAULTS.reservationStatus,
      paymentStatus: memory.paymentStatus ?? INTERNAL_MEMORY_DEFAULTS.paymentStatus,
      portalStatus: memory.portalStatus ?? INTERNAL_MEMORY_DEFAULTS.portalStatus,
      isConversationReady: missingInformation.length === 0,
    };
  }
}

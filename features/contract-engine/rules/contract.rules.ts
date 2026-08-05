import {
  BRANDING_RULE,
  getEventType,
  getQrRule,
  getVatRule,
  resolveVat,
  TRANSPORT_TABLE,
  type EventTypeId,
} from "@/features/business-core";
import {
  CORPORATE_CONTRACT_TEMPLATE,
  SOCIAL_CONTRACT_TEMPLATE,
} from "../templates";
import type {
  ContractBuildError,
  ContractCommercialRules,
  ContractTemplate,
  ContractType,
} from "../types";

const CONTRACT_TYPE_BY_EVENT: Partial<Record<EventTypeId, ContractType>> = {
  COMPANY: "CORPORATE",
  WEDDING: "SOCIAL",
  BIRTHDAY: "SOCIAL",
  GRADUATION: "SOCIAL",
  PARTY: "SOCIAL",
};

const CONTRACT_TEMPLATE_BY_TYPE: Readonly<Record<ContractType, ContractTemplate>> = {
  SOCIAL: SOCIAL_CONTRACT_TEMPLATE,
  CORPORATE: CORPORATE_CONTRACT_TEMPLATE,
};

export type ContractRuleResolution =
  | {
      success: true;
      contractType: ContractType;
      template: ContractTemplate;
      commercialRules: ContractCommercialRules;
    }
  | { success: false; error: ContractBuildError };

export function resolveContractRules(
  eventType: EventTypeId,
  transportRateId?: string,
  invoiceRequested = false,
): ContractRuleResolution {
  const contractType = CONTRACT_TYPE_BY_EVENT[eventType];

  if (!contractType) {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_EVENT_TYPE",
        eventType,
        message: `${getEventType(eventType).name} requiere clasificación antes de generar un contrato.`,
      },
    };
  }

  const transportRate = transportRateId
    ? TRANSPORT_TABLE.rates.find((rate) => rate.id === transportRateId)
    : null;

  if (transportRateId && !transportRate) {
    return {
      success: false,
      error: {
        code: "TRANSPORT_RATE_NOT_FOUND",
        transportRateId,
        message: `La tarifa de traslado ${transportRateId} no existe en Business Core.`,
      },
    };
  }

  return {
    success: true,
    contractType,
    template: CONTRACT_TEMPLATE_BY_TYPE[contractType],
    commercialRules: {
      vat: resolveVat(eventType, invoiceRequested),
      vatLabel: getVatRule(eventType).label,
      qr: getQrRule(eventType),
      branding: BRANDING_RULE,
      transportRate: transportRate ?? null,
    },
  };
}

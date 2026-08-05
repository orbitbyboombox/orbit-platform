import type { ContractTemplate } from "../types";

export const SOCIAL_CONTRACT_TEMPLATE: ContractTemplate = {
  type: "SOCIAL",
  name: "Contrato de evento social BOOMBOX",
  applicableEventTypes: ["WEDDING", "BIRTHDAY", "GRADUATION", "PARTY"],
  clauseIds: [
    "COMMERCIAL",
    "PAYMENTS",
    "CANCELLATION",
    "FORCE_MAJEURE",
    "IMAGE_AUTHORIZATION",
    "CUSTOMER_RESPONSIBILITIES",
    "BOOMBOX_RESPONSIBILITIES",
  ],
};

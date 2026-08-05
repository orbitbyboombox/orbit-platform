import type { ContractTemplate } from "../types";

export const CORPORATE_CONTRACT_TEMPLATE: ContractTemplate = {
  type: "CORPORATE",
  name: "Contrato de evento corporativo BOOMBOX",
  applicableEventTypes: ["COMPANY"],
  clauseIds: [
    "COMMERCIAL",
    "PAYMENTS",
    "CUSTOMER_RESPONSIBILITIES",
    "BOOMBOX_RESPONSIBILITIES",
    "CANCELLATION",
    "FORCE_MAJEURE",
    "IMAGE_AUTHORIZATION",
  ],
};

import { buildContractClause } from "./clauses";
import { resolveContractRules } from "./rules";
import type { ContractBuildInput, ContractBuildResult } from "./types";

export function buildContract(input: ContractBuildInput): ContractBuildResult {
  const resolution = resolveContractRules(
    input.event.eventType,
    input.transportRateId,
    input.invoiceRequested,
  );

  if (!resolution.success) return resolution;

  const context = {
    input,
    contractType: resolution.contractType,
    commercialRules: resolution.commercialRules,
  };

  return {
    success: true,
    contract: {
      id: input.contractId,
      projectId: input.projectId,
      issuedOn: input.issuedOn,
      type: resolution.contractType,
      templateName: resolution.template.name,
      customer: input.customer,
      event: input.event,
      serviceSummary: input.serviceSummary,
      priceBreakdown: input.priceBreakdown,
      commercialRules: resolution.commercialRules,
      clauses: resolution.template.clauseIds.map((clauseId) =>
        buildContractClause(clauseId, context),
      ),
    },
  };
}

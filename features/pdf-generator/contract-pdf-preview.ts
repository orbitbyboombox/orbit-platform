import { getEventType } from "@/features/business-core";
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "@/features/company-settings";
import type { ContractPdfGeneratorInput, ContractPdfPreviewModel } from "./types";

function describeTransport(input: ContractPdfGeneratorInput): string {
  const rate = input.contract.commercialRules.transportRate;
  if (!rate) {
    return input.contract.priceBreakdown.transport.amount > 0
      ? "Traslado cotizado"
      : "Sin traslado asociado";
  }
  return `${rate.origin} → ${rate.destination}`;
}

export function createContractPdfPreview(
  input: ContractPdfGeneratorInput,
  company:CompanySettings=DEFAULT_COMPANY_SETTINGS,
): ContractPdfPreviewModel {
  const { contract, project } = input;
  const pricing = contract.priceBreakdown;

  return {
    metadata: {
      title: `${contract.templateName} - ${project.name}`,
      subject: `Contrato ${contract.id}`,
      language: company.locale,
      contractId: contract.id,
      projectId: contract.projectId,
    },
    branding: {
      applicationName: `${company.productName} ${company.productVersion}`,
      logoPath: company.documentLogoUrl,
      developedBy: company.developedBy,
      poweredBy: company.poweredBy,
    },
    heading: {
      title: project.name,
      contractType: contract.templateName,
      issuedOn: contract.issuedOn,
    },
    customer: [
      { label: "Nombre", value: contract.customer.name },
      { label: "Correo", value: contract.customer.email },
      { label: "Teléfono", value: contract.customer.phone ?? "No informado" },
    ],
    event: [
      { label: "Tipo de evento", value: getEventType(contract.event.eventType).name },
      { label: "Fecha", value: contract.event.date },
      { label: "Hora", value: contract.event.time },
      { label: "Lugar", value: `${contract.event.venue}, ${contract.event.city}` },
    ],
    services: {
      selected: project.services,
      duration: project.duration ?? null,
      extras: project.extras,
      transport: describeTransport(input),
    },
    commercialSummary: [
      { label: "Subtotal", ...pricing.basePrice },
      { label: "Extras", ...pricing.extras },
      { label: "Traslado", ...pricing.transport },
      { label: "IVA", ...pricing.iva },
      { label: "Total", ...pricing.finalTotal },
    ],
    clauses: contract.clauses,
    signatures: [
      { role: "CUSTOMER", label: "Firma del cliente", signerName: contract.customer.name, embedded: Boolean(input.customerSignature), evidenceId: input.customerSignature?.evidenceId, signedAt: input.customerSignature?.signedAt, imageDataUrl: input.customerSignature?.imageDataUrl },
      { role: "BOOMBOX", label: `Firma ${company.brandName}`, signerName: company.legalName, embedded: false },
    ],
  };
}

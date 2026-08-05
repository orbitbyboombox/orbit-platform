import { calculatePrice, resolveVat, type EventTypeId } from "@/features/business-core";
import { buildContract } from "@/features/contract-engine";
import { createContractPdfPreview, type ContractPdfPreviewModel } from "@/features/pdf-generator";
import { formatServiceSummary } from "@/lib/format-service-summary";

export interface MockAgreementInput {
  projectId: string;
  projectName: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  eventType?: EventTypeId;
  eventDate: string;
  eventTime?: string;
  location: string;
  city?: string;
  services: readonly string[];
}

export function createMockAgreement(input: MockAgreementInput): ContractPdfPreviewModel {
  const eventType = input.eventType ?? "WEDDING";
  const priceBreakdown = calculatePrice({
    basePrice: { amount: 650_000, currency: "CLP" },
    extras: [
      {
        id: "PHOTO_BOOK",
        label: "Libro de firmas",
        quantity: 1,
        unitPrice: { amount: 85_000, currency: "CLP" },
      },
    ],
    transport: { amount: 45_000, currency: "CLP" },
    vatDecision: resolveVat(eventType),
  });

  const contract = buildContract({
    projectId: input.projectId,
    contractId: `CTR-${input.projectId}`,
    issuedOn: "5 de agosto de 2026",
    customer: {
      name: input.clientName,
      identifier: "Pendiente de validación",
      email: input.clientEmail ?? "cliente@boombox.cl",
      phone: input.clientPhone,
    },
    event: {
      eventType,
      date: input.eventDate,
      time: input.eventTime ?? "19:00",
      venue: input.location,
      city: input.city ?? "Santiago",
    },
    serviceSummary: formatServiceSummary(input.services, "3 horas"),
    priceBreakdown,
  });

  if (!contract.success) {
    throw new Error(contract.error.message);
  }

  return createContractPdfPreview({
    contract: contract.contract,
    project: {
      name: input.projectName,
      services: input.services,
      duration: "3 horas",
      extras: ["Libro de firmas"],
    },
  });
}

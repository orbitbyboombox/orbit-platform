import { isValidChileanRut } from "../../lib/chile/rut.ts";
import { isPhoneE164 } from "../../lib/phone/e164.ts";

type CustomerStep = {
  name: string;
  rut: string;
  phone: string;
};

type EventStep = {
  date: string;
  time: string;
  venue: string;
  address: string;
  municipality: string;
  operationalContact: string;
  operationalPhone: string;
};

type ServiceStep = {
  code: string;
  total: number;
  additionalCodes?: string[];
};

type ContractStep = {
  termsRead: boolean;
  termsAccepted: boolean;
  signature: string;
};

type PaymentStep = {
  method?: "TRANSFER" | "MERCADO_PAGO";
  receiptBase64: string;
};

export function automaticBookingStepIssues(input: {
  step: number;
  customer: CustomerStep;
  event: EventStep;
  service: ServiceStep;
  contract: ContractStep;
  payment: PaymentStep;
  validMunicipality: boolean;
}) {
  const issues: string[] = [];

  if (input.step === 0) {
    if (!input.customer.name.trim()) issues.push("Completa tu nombre y apellido.");
    if (!isValidChileanRut(input.customer.rut)) issues.push("Ingresa un RUT válido.");
    if (!isPhoneE164(input.customer.phone)) issues.push("Ingresa un teléfono internacional válido con prefijo +.");
  }

  if (input.step === 1) {
    if (!input.event.date) issues.push("Selecciona la fecha del evento.");
    if (!input.event.time) issues.push("Selecciona la hora de inicio.");
    if (!input.event.venue.trim()) issues.push("Completa el lugar del evento.");
    if (!input.validMunicipality) issues.push("Selecciona una comuna de la lista.");
    if (!input.event.operationalContact.trim()) issues.push("Completa el contacto operacional.");
    if (!isPhoneE164(input.event.operationalPhone)) issues.push("Ingresa un teléfono operacional válido con prefijo +.");
  }

  if (input.step === 2 && (!input.service.code || input.service.total <= 0)) {
    issues.push("Selecciona un servicio disponible.");
  }

  if (input.step === 3) {
    if (!input.contract.termsRead) issues.push("Desplázate hasta el final del contrato.");
    else if (!input.contract.termsAccepted) issues.push("Acepta los Términos y Condiciones.");
    if (input.contract.termsAccepted && !input.contract.signature) issues.push("Firma dentro del recuadro para continuar.");
  }

  if (
    input.step === 4 &&
    input.payment.method !== "MERCADO_PAGO" &&
    !input.payment.receiptBase64
  ) {
    issues.push("Adjunta el comprobante de pago.");
  }

  return issues;
}

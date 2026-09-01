import { isValidChileanRut } from "../../lib/chile/rut.ts";

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
};

type ContractStep = {
  termsRead: boolean;
  termsAccepted: boolean;
  signature: string;
};

type PaymentStep = {
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
    if (!/^\+569\d{8}$/.test(input.customer.phone)) issues.push("Ingresa un teléfono válido de 8 dígitos.");
  }

  if (input.step === 1) {
    if (!input.event.date) issues.push("Selecciona la fecha del evento.");
    if (!input.event.time) issues.push("Selecciona la hora de inicio.");
    if (!input.event.venue.trim()) issues.push("Completa el lugar del evento.");
    if (!input.event.address.trim()) issues.push("Completa la dirección del evento.");
    if (!input.validMunicipality) issues.push("Selecciona una comuna de la lista.");
    if (!input.event.operationalContact.trim()) issues.push("Completa el contacto operacional.");
    if (!/^\+569\d{8}$/.test(input.event.operationalPhone)) issues.push("Ingresa un teléfono operacional válido de 8 dígitos.");
  }

  if (input.step === 2 && (!input.service.code || input.service.total <= 0)) {
    issues.push("Selecciona un servicio disponible.");
  }

  if (input.step === 3) {
    if (!input.contract.termsRead) issues.push("Desplázate hasta el final del contrato.");
    else if (!input.contract.termsAccepted) issues.push("Acepta los Términos y Condiciones.");
    if (input.contract.termsAccepted && !input.contract.signature) issues.push("Firma dentro del recuadro para continuar.");
  }

  if (input.step === 4 && !input.payment.receiptBase64) {
    issues.push("Adjunta el comprobante de pago.");
  }

  return issues;
}

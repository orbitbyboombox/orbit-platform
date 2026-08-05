import type {
  ContractClause,
  ContractClauseFactory,
  ContractClauseId,
} from "../types";

function formatClp(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

const commercialClause: ContractClauseFactory = ({ input, commercialRules }) => ({
  id: "COMMERCIAL",
  category: "COMMERCIAL",
  title: "Condiciones comerciales",
  content: `BOOMBOX prestará ${input.serviceSummary} por un total de ${formatClp(input.priceBreakdown.finalTotal.amount)}. ${commercialRules.vatLabel}. Las condiciones de QR, branding y traslado corresponden a las reglas comerciales vigentes incluidas en este contrato.`,
});

const paymentsClause: ContractClauseFactory = () => ({
  id: "PAYMENTS",
  category: "FINANCIAL",
  title: "Pagos",
  content:
    "La reserva se confirma una vez recibido el pago inicial acordado. El saldo deberá pagarse en los plazos informados en las condiciones comerciales del proyecto.",
});

const cancellationClause: ContractClauseFactory = () => ({
  id: "CANCELLATION",
  category: "LEGAL",
  title: "Cancelación y reprogramación",
  content:
    "Toda solicitud de cancelación o reprogramación deberá comunicarse por escrito. Su aceptación y los montos aplicables se resolverán según la anticipación, disponibilidad y costos ya comprometidos.",
});

const forceMajeureClause: ContractClauseFactory = () => ({
  id: "FORCE_MAJEURE",
  category: "LEGAL",
  title: "Fuerza mayor",
  content:
    "Ninguna parte será responsable por incumplimientos causados por hechos imprevisibles o irresistibles fuera de su control. Ambas partes coordinarán de buena fe una solución razonable.",
});

const imageAuthorizationClause: ContractClauseFactory = () => ({
  id: "IMAGE_AUTHORIZATION",
  category: "LEGAL",
  title: "Autorización de imagen",
  content:
    "El uso público de fotografías o registros del evento por parte de BOOMBOX requerirá la autorización correspondiente del cliente y respetará las restricciones informadas por escrito.",
});

const customerResponsibilitiesClause: ContractClauseFactory = () => ({
  id: "CUSTOMER_RESPONSIBILITIES",
  category: "RESPONSIBILITIES",
  title: "Responsabilidades del cliente",
  content:
    "El cliente deberá entregar información correcta, facilitar el acceso al recinto y disponer oportunamente de las condiciones técnicas y permisos requeridos para prestar el servicio.",
});

const boomboxResponsibilitiesClause: ContractClauseFactory = () => ({
  id: "BOOMBOX_RESPONSIBILITIES",
  category: "RESPONSIBILITIES",
  title: "Responsabilidades de BOOMBOX",
  content:
    "BOOMBOX deberá prestar el servicio acordado con personal y equipamiento adecuados, respetar la coordinación confirmada y comunicar oportunamente cualquier incidencia relevante.",
});

export const CONTRACT_CLAUSE_REGISTRY: Readonly<
  Record<ContractClauseId, ContractClauseFactory>
> = {
  COMMERCIAL: commercialClause,
  PAYMENTS: paymentsClause,
  CANCELLATION: cancellationClause,
  FORCE_MAJEURE: forceMajeureClause,
  IMAGE_AUTHORIZATION: imageAuthorizationClause,
  CUSTOMER_RESPONSIBILITIES: customerResponsibilitiesClause,
  BOOMBOX_RESPONSIBILITIES: boomboxResponsibilitiesClause,
};

export function buildContractClause(
  clauseId: ContractClauseId,
  context: Parameters<ContractClauseFactory>[0],
): ContractClause {
  return CONTRACT_CLAUSE_REGISTRY[clauseId](context);
}

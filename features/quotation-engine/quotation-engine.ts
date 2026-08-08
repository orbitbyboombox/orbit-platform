import { getQuotationExtras, getService, QUOTATION_EXTRA_RULES } from "@/features/business-core";
import type { Money } from "@/features/business-core";
import type { CreateQuotationInput, QuotationCalculation, QuotationLine } from "./types";

const clp = (amount: number): Money => ({ amount: Math.round(amount), currency: "CLP" });
const ADDITIONAL_HOUR_PRICE: Partial<Record<string, number>> = { CLASSIC: 100_000, BLACK_STUDIO: 150_000, POLAROID: 150_000, HASHTAG: 100_000, BBOX360: 130_000 };

export interface ConfiguredCommercialPrice {
  readonly category: "SERVICE" | "EXTRA" | "TRANSPORT";
  readonly code: string;
  readonly durationHours: number | null;
  readonly destination: string | null;
  readonly unitPrice: number | null;
  readonly pricingStatus: "DEFINED" | "REQUIRES_QUOTE";
}

function configuredPrice(catalog: readonly ConfiguredCommercialPrice[] | undefined, category: ConfiguredCommercialPrice["category"], code: string, duration?: number) {
  return catalog?.find((item) => item.category === category && item.code === code && (duration == null || item.durationHours === duration));
}

export function calculateQuotation(input: CreateQuotationInput, catalog: readonly ConfiguredCommercialPrice[], vatPercentage: number): QuotationCalculation {
  const blockers: string[] = [];
  const lines: QuotationLine[] = [];
  for (const selected of input.services) {
    const service = getService(selected.serviceId);
    const configured = configuredPrice(catalog, "SERVICE", selected.serviceId, selected.duration);
    const price = configured?.pricingStatus === "DEFINED" && configured.unitPrice != null ? { status: "DEFINED" as const, value: clp(configured.unitPrice) } : { status: "REQUIRES_QUOTE" as const };
    if (price.status !== "DEFINED") { blockers.push(`${service.name} requiere cotización comercial.`); continue; }
    lines.push({ code: selected.serviceId, label: `${service.name} · ${selected.duration} horas`, quantity: 1, unitPrice: price.value, total: price.value });
    if ((selected.additionalHours ?? 0) > 0) {
      const additionalHourPrice = ADDITIONAL_HOUR_PRICE[selected.serviceId];
      const hourly = additionalHourPrice != null ? { status: "DEFINED" as const, value: clp(additionalHourPrice) } : { status: "REQUIRES_QUOTE" as const };
      if (hourly.status !== "DEFINED") blockers.push(`La hora adicional de ${service.name} requiere cotización comercial.`);
      else lines.push({ code: `${selected.serviceId}_ADDITIONAL_HOUR`, label: `Hora adicional · ${service.name}`, quantity: selected.additionalHours ?? 0, unitPrice: hourly.value, total: clp(hourly.value.amount * (selected.additionalHours ?? 0)) });
    }
  }
  const allowed = new Set(getQuotationExtras(input.eventType).map(({ id }) => id));
  for (const selected of input.extras) {
    if (!allowed.has(selected.extraId)) { blockers.push(`${QUOTATION_EXTRA_RULES[selected.extraId].label} no está disponible para este tipo de evento.`); continue; }
    if (selected.extraId === "ADDITIONAL_HOUR") continue;
    const rule = QUOTATION_EXTRA_RULES[selected.extraId];
    const configured = configuredPrice(catalog, "EXTRA", selected.extraId);
    const quantity = Math.max(selected.quantity ?? 1, rule.minimumQuantity ?? 1);
    const rulePrice = rule.included || selected.extraId === "SCRAPBOOK" ? rule.price : undefined;
    const extraPrice = rulePrice?.status === "DEFINED" ? rulePrice : configured?.pricingStatus === "DEFINED" && configured.unitPrice != null ? { status: "DEFINED" as const, value: clp(configured.unitPrice) } : { status: "REQUIRES_QUOTE" as const };
    if (extraPrice.status !== "DEFINED") { blockers.push(`${rule.label} requiere cotización comercial.`); continue; }
    lines.push({ code: selected.extraId, label: rule.label, quantity, unitPrice: extraPrice.value, total: clp(extraPrice.value.amount * quantity) });
  }
  const normalizedDestination = input.destination.trim().toLocaleLowerCase("es-CL");
  const configuredTransport = catalog.find((item) => item.category === "TRANSPORT" && (item.destination?.toLocaleLowerCase("es-CL") === normalizedDestination || item.code.toLocaleLowerCase("es-CL") === normalizedDestination));
  const transportValue = configuredTransport?.pricingStatus === "DEFINED" && configuredTransport.unitPrice != null ? { status: "DEFINED" as const, value: clp(configuredTransport.unitPrice) } : { status: "REQUIRES_QUOTE" as const };
  if (transportValue.status !== "DEFINED") blockers.push(`No existe tarifa de transporte aprobada para ${input.destination}.`);
  const transport = transportValue.status === "DEFINED" ? transportValue.value : clp(0);
  const subtotalAmount = lines.reduce((sum, line) => sum + line.total.amount, 0) + transport.amount;
  const discount = input.discount ?? clp(0);
  const taxable = Math.max(0, subtotalAmount - discount.amount);
  const taxes = input.customerType === "COMPANY" ? clp(taxable * (vatPercentage / 100)) : clp(0);
  return { ready: blockers.length === 0, blockers, lines, subtotal: clp(subtotalAmount), transport, discount, taxes, grandTotal: clp(taxable + taxes.amount) };
}

import { calculateAdditionalHourPrice, getQuotationExtras, getService, getServicePrice, getTransportRate, QUOTATION_EXTRA_RULES } from "@/features/business-core";
import type { Money } from "@/features/business-core";
import type { CreateQuotationInput, QuotationCalculation, QuotationLine } from "./types";

const clp = (amount: number): Money => ({ amount: Math.round(amount), currency: "CLP" });

export function calculateQuotation(input: CreateQuotationInput): QuotationCalculation {
  const blockers: string[] = [];
  const lines: QuotationLine[] = [];
  for (const selected of input.services) {
    const service = getService(selected.serviceId);
    const price = getServicePrice(selected.serviceId, selected.duration);
    if (price.status !== "DEFINED") { blockers.push(`${service.name} requiere cotización comercial.`); continue; }
    lines.push({ code: selected.serviceId, label: `${service.name} · ${selected.duration} horas`, quantity: 1, unitPrice: price.value, total: price.value });
    if ((selected.additionalHours ?? 0) > 0) {
      const hourly = calculateAdditionalHourPrice(selected.serviceId, selected.duration);
      if (hourly.status !== "DEFINED") blockers.push(`La hora adicional de ${service.name} requiere cotización comercial.`);
      else lines.push({ code: `${selected.serviceId}_ADDITIONAL_HOUR`, label: `Hora adicional · ${service.name}`, quantity: selected.additionalHours ?? 0, unitPrice: hourly.value, total: clp(hourly.value.amount * (selected.additionalHours ?? 0)) });
    }
  }
  const allowed = new Set(getQuotationExtras(input.eventType).map(({ id }) => id));
  for (const selected of input.extras) {
    if (!allowed.has(selected.extraId)) { blockers.push(`${QUOTATION_EXTRA_RULES[selected.extraId].label} no está disponible para este tipo de evento.`); continue; }
    if (selected.extraId === "ADDITIONAL_HOUR") continue;
    const rule = QUOTATION_EXTRA_RULES[selected.extraId];
    const quantity = Math.max(selected.quantity ?? 1, rule.minimumQuantity ?? 1);
    if (rule.price.status !== "DEFINED") { blockers.push(`${rule.label} requiere cotización comercial.`); continue; }
    lines.push({ code: selected.extraId, label: rule.label, quantity, unitPrice: rule.price.value, total: clp(rule.price.value.amount * quantity) });
  }
  const transportValue = getTransportRate("Chicureo", input.destination);
  if (transportValue.status !== "DEFINED") blockers.push(`No existe tarifa de transporte aprobada para ${input.destination}.`);
  const transport = transportValue.status === "DEFINED" ? transportValue.value : clp(0);
  const subtotalAmount = lines.reduce((sum, line) => sum + line.total.amount, 0) + transport.amount;
  const discount = input.discount ?? clp(0);
  const taxable = Math.max(0, subtotalAmount - discount.amount);
  const taxes = input.customerType === "COMPANY" ? clp(taxable * 0.19) : clp(0);
  return { ready: blockers.length === 0, blockers, lines, subtotal: clp(subtotalAmount), transport, discount, taxes, grandTotal: clp(taxable + taxes.amount) };
}

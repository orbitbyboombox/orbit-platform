import type { Money } from "@/features/business-core";
import type { NegotiatedPrice, NegotiationMethod } from "./types";

const clp = (amount: number): Money => ({ amount: Math.round(amount), currency: "CLP" });

export function calculateNegotiatedPrice(input: {
  officialPrice: Money;
  method: NegotiationMethod;
  value: number;
  reason?: string;
}): NegotiatedPrice {
  if (!Number.isFinite(input.value) || input.value < 0) throw new Error("Ingresa un ajuste comercial válido.");
  if (input.method === "PERCENT_DISCOUNT" && input.value > 100) throw new Error("El descuento no puede superar el 100%.");
  const official = input.officialPrice.amount;
  const final = input.method === "RESTORE" ? official
    : input.method === "MANUAL" ? input.value
      : input.method === "PERCENT_DISCOUNT" ? official * (1 - input.value / 100)
        : input.method === "PERCENT_INCREASE" ? official * (1 + input.value / 100)
          : input.method === "FIXED_DISCOUNT" ? official - input.value
            : official + input.value;
  if (final < 0) throw new Error("El precio final no puede ser negativo.");
  const roundedFinal = Math.round(final);
  const difference = roundedFinal - official;
  if (difference !== 0 && !input.reason?.trim()) throw new Error("La razón de negociación es obligatoria.");
  return {
    officialPrice: input.officialPrice,
    finalCustomerPrice: clp(roundedFinal),
    difference: clp(difference),
    discountPercentage: difference < 0 && official > 0 ? Math.abs(difference) / official * 100 : 0,
    increasePercentage: difference > 0 && official > 0 ? difference / official * 100 : 0,
    modified: difference !== 0,
  };
}

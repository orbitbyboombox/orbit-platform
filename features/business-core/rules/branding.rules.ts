import type { Money } from "../types";

export interface BrandingRule {
  pricePerSide: Money;
  vatExclusive: boolean;
  minimumSides: number;
  maximumSides: number | null;
}

export const BRANDING_RULE: BrandingRule = {
  pricePerSide: { amount: 75_000, currency: "CLP" },
  vatExclusive: true,
  minimumSides: 2,
  maximumSides: null,
};

export function isBrandingSideCountAllowed(sides: number): boolean {
  return Number.isInteger(sides) && sides >= BRANDING_RULE.minimumSides && (BRANDING_RULE.maximumSides === null || sides <= BRANDING_RULE.maximumSides);
}

export function shouldChargeBranding(sides: number): boolean {
  return sides > 0;
}

export function calculateBrandingPrice(sides: number): Money {
  if (!isBrandingSideCountAllowed(sides)) {
    throw new RangeError(`Branding requires at least ${BRANDING_RULE.minimumSides} sides.`);
  }
  return { amount: BRANDING_RULE.pricePerSide.amount * sides, currency: "CLP" };
}

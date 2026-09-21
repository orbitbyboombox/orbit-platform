import { detectBiancaIntents } from "./bianca-intent-engine.ts";
import type { BiancaActionPlan, BiancaKnownOpportunity } from "./bianca-agent.types.ts";

function hasDate(value?: string) { return Boolean(value?.trim()); }
function hasService(value?: readonly string[]) { return Boolean(value?.length); }

export function planBiancaTurn(input: { text: string; known: BiancaKnownOpportunity }): BiancaActionPlan {
  const intents = detectBiancaIntents(input.text);
  const intent = intents[0] ?? "UNKNOWN";
  const missing = [
    !input.known.preferredName && "preferred_name",
    !hasDate(input.known.eventDate) && "event_date",
    !input.known.commune && "commune",
    !hasService(input.known.serviceCodes) && "service",
  ].filter(Boolean) as string[];
  const highIntent = Boolean(input.known.eventDate && input.known.commune && hasService(input.known.serviceCodes) && intents.some((item) => ["ASK_RESERVATION", "ASK_PRICE", "ASK_AVAILABILITY"].includes(item)));
  let nextBestAction: BiancaActionPlan["nextBestAction"] = "WAIT_FOR_CUSTOMER";
  if (intents.includes("HUMAN_REQUEST") || intents.includes("COMPLAINT") || intents.includes("DISCOUNT_REQUEST")) nextBestAction = "HANDOFF";
  else if (intents.includes("ASK_CATALOG")) nextBestAction = "CATALOG_LOOKUP";
  else if (!input.known.preferredName) nextBestAction = "ASK_NAME";
  else if (!hasDate(input.known.eventDate)) nextBestAction = "ASK_DATE";
  else if (!input.known.commune) nextBestAction = "ASK_COMMUNE";
  else if (!hasService(input.known.serviceCodes)) nextBestAction = "CATALOG_LOOKUP";
  else if (intents.includes("ASK_AVAILABILITY") && input.known.availability === undefined) nextBestAction = "AVAILABILITY_LOOKUP";
  else if (intents.includes("ASK_PRICE") && !input.known.priceResolved) nextBestAction = "PRICE_LOOKUP";
  else if (highIntent && input.known.priceResolved && input.known.availability === "AVAILABLE") nextBestAction = "OFFER_RESERVATION";
  else if (input.known.priceResolved) nextBestAction = "OFFER_QUOTE";

  const commercialStage = nextBestAction === "HANDOFF" ? "HUMAN_REQUIRED" : input.known.priceResolved ? "PRICING_READY" : input.known.preferredName ? "QUALIFYING" : "NEW_LEAD";
  const leadIntent = highIntent ? "HIGH" : intents.some((item) => ["ASK_PRICE", "ASK_AVAILABILITY", "ASK_SERVICE"].includes(item)) ? "MEDIUM" : "LOW";
  return { commercialStage, intent, intents, leadIntent, missing, nextBestAction };
}

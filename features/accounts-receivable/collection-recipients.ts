import { normalizeEmailRecipients } from "@/lib/email/recipients";

type Metadata = Record<string, unknown> | null | undefined;
function value(metadata: Metadata, key: string) {
  const recipients = metadata?.collectionRecipients;
  if (!recipients || typeof recipients !== "object" || Array.isArray(recipients)) return "";
  return String((recipients as Record<string, unknown>)[key] ?? "").trim();
}
export function resolveCollectionRecipients(input: { commercialEmail?: string | null; commercialCc?: string | null; metadata?: Metadata }) {
  const financialTo = value(input.metadata, "to");
  return financialTo
    ? normalizeEmailRecipients({ to: financialTo, cc: value(input.metadata, "cc") })
    : normalizeEmailRecipients({ to: input.commercialEmail ?? "", cc: input.commercialCc ?? "" });
}
export function collectionRecipientFields(metadata: Metadata) {
  return { collectionEmail: value(metadata, "to"), collectionCcEmail: value(metadata, "cc") };
}

/** Warehouse paper inventory domain model. No database writes are performed here. */
export type PaperFormat = "4x6_normal" | "4x6_precut" | "5x15_classic" | (string & {});
export type PaperLocation = "warehouse" | `box:${string}`;
export type PaperMovementKind = "opening" | "purchase" | "transfer" | "return" | "consumption" | "adjustment";

export interface PaperMovement {
  id: string;
  idempotencyKey: string;
  format: PaperFormat;
  kind: PaperMovementKind;
  quantity: number;
  from?: PaperLocation;
  to?: PaperLocation;
  eventId?: string;
  occurredAt: string;
  reason?: string;
}

export interface PaperBalances { [locationAndFormat: string]: number }
export const inventoryKey = (location: PaperLocation, format: PaperFormat): string =>
  JSON.stringify([location, format]);

export function applyPaperMovement(
  balances: PaperBalances,
  movement: PaperMovement,
  processedKeys: ReadonlySet<string>,
): PaperBalances {
  if (!movement.idempotencyKey.trim()) throw new Error("Missing idempotency key");
  if (processedKeys.has(movement.idempotencyKey)) return { ...balances };
  if (!Number.isSafeInteger(movement.quantity) || movement.quantity <= 0)
    throw new Error("Paper quantity must be a positive integer");
  if (!movement.from && !movement.to) throw new Error("Missing source and destination");
  if (movement.from && movement.to && movement.from === movement.to)
    throw new Error("Source and destination cannot match");
  if (["opening", "purchase"].includes(movement.kind) && (movement.from || movement.to !== "warehouse"))
    throw new Error("Inbound stock must enter the warehouse");
  if (movement.kind === "return" && (!movement.from?.startsWith("box:") || movement.to !== "warehouse"))
    throw new Error("Return must move paper from a box to the warehouse");
  if (movement.kind === "transfer" && (movement.from !== "warehouse" || !movement.to?.startsWith("box:")))
    throw new Error("Transfer must move paper from warehouse to a box");
  if (movement.kind === "consumption" && (!movement.from?.startsWith("box:") || movement.to || !movement.eventId))
    throw new Error("Consumption requires a source and event");
  const next = { ...balances };
  if (movement.from) {
    const key = inventoryKey(movement.from, movement.format);
    const available = next[key] ?? 0;
    if (available < movement.quantity) throw new Error("Insufficient paper stock");
    next[key] = available - movement.quantity;
  }
  if (movement.to) {
    const key = inventoryKey(movement.to, movement.format);
    next[key] = (next[key] ?? 0) + movement.quantity;
  }
  return next;
}

/** User-reported warehouse count, intentionally unassigned to a paper format. */
export const UNCONFIRMED_WAREHOUSE_OPENING = Object.freeze({
  purchasedBoxes: 12,
  additionalBoxes: 1,
  photosPerBox: 1400,
  looseRollPhotos: 700,
  totalPhotos: 18900,
  format: null,
});

import { applyPaperMovement, inventoryKey, type PaperBalances, type PaperMovement } from "./domain.ts";

export interface PaperReconciliation {
  balances: PaperBalances;
  warehouseTotal: number;
  boxesTotal: number;
  consumedTotal: number;
  incomingTotal: number;
  adjustmentNet: number;
  accountedTotal: number;
  movementsProcessed: number;
}

/**
 * Replays the immutable movement ledger in chronological order.
 * Caller must supply the complete ledger; never use a paginated subset for official balances.
 * Persist movements atomically with a unique idempotency key and row locks in the database.
 */
export function reconcilePaperLedger(movements: readonly PaperMovement[]): PaperReconciliation {
  const seen = new Set<string>();
  let balances: PaperBalances = {};
  let consumedTotal = 0;
  let incomingTotal = 0;
  let adjustmentNet = 0;
  const ordered = [...movements].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  for (const movement of ordered) {
    if (seen.has(movement.idempotencyKey)) continue;
    balances = applyPaperMovement(balances, movement, seen);
    seen.add(movement.idempotencyKey);
    if (movement.kind === "consumption") consumedTotal += movement.quantity;
    if (movement.kind === "opening" || movement.kind === "purchase") incomingTotal += movement.quantity;
    if (movement.kind === "adjustment") adjustmentNet += movement.to ? movement.quantity : -movement.quantity;
  }
  let warehouseTotal = 0;
  let boxesTotal = 0;
  for (const [key, quantity] of Object.entries(balances)) {
    const location = JSON.parse(key)[0] as string;
    if (location === "warehouse") warehouseTotal += quantity;
    else if (location.startsWith("box:")) boxesTotal += quantity;
  }
  const accountedTotal = warehouseTotal + boxesTotal + consumedTotal;
  if (accountedTotal !== incomingTotal + adjustmentNet)
    throw new Error("Paper reconciliation mismatch");
  return { balances, warehouseTotal, boxesTotal, consumedTotal, incomingTotal, adjustmentNet, accountedTotal, movementsProcessed: seen.size };
}

export function availablePaper(balances: PaperBalances, location: "warehouse" | `box:${string}`, format: string): number {
  return balances[inventoryKey(location, format)] ?? 0;
}

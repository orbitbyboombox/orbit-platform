import { reconcilePaperBlock, reconcilePaperHandoff, type PaperBlockCount } from "./paper-block-reconciliation.ts";

export type ClosedPaperBlock = Readonly<{
  count: PaperBlockCount;
  closedBy: string;
  requestId: string;
}>;

export type PaperBoxCloseout = Readonly<{
  am?: ClosedPaperBlock;
  pm?: ClosedPaperBlock;
  inventoryReconciledAt?: string;
}>;

function requireActor(actorId: string, requestId: string) {
  if (!actorId?.trim() || !requestId?.trim()) throw new Error("Operador y solicitud obligatorios.");
}

function identical(existing: ClosedPaperBlock, count: PaperBlockCount, actorId: string, requestId: string) {
  return existing.requestId === requestId && existing.closedBy === actorId &&
    JSON.stringify(existing.count) === JSON.stringify(count);
}

/** Pure transition; persistence must use a DB transaction/optimistic concurrency guard. */
export function closePaperAM(
  state: PaperBoxCloseout,
  count: PaperBlockCount,
  actorId: string,
  requestId: string,
): PaperBoxCloseout {
  requireActor(actorId, requestId);
  reconcilePaperBlock(count);
  if (state.am) {
    if (identical(state.am, count, actorId, requestId)) return state;
    throw new Error("AM ya cerrado; requiere corrección auditada.");
  }
  if (state.pm || state.inventoryReconciledAt) throw new Error("No se puede cerrar AM después de PM.");
  return { ...state, am: { count, closedBy: actorId, requestId } };
}

export function closePaperPM(
  state: PaperBoxCloseout,
  count: PaperBlockCount,
  actorId: string,
  requestId: string,
): PaperBoxCloseout {
  requireActor(actorId, requestId);
  reconcilePaperBlock(count);
  if (state.pm) {
    if (identical(state.pm, count, actorId, requestId)) return state;
    throw new Error("PM ya cerrado; requiere corrección auditada.");
  }
  if (!state.am) throw new Error("Debe cerrarse AM antes de PM.");
  reconcilePaperHandoff(state.am.count, count);
  if (state.inventoryReconciledAt) throw new Error("Inventario ya conciliado.");
  return { ...state, pm: { count, closedBy: actorId, requestId } };
}

/** Returns consumption, but NEVER writes stock. A separate unique DB ledger must apply it once. */
export function paperInventoryProposal(state: PaperBoxCloseout) {
  if (!state.am || !state.pm) throw new Error("Faltan cierres AM/PM.");
  if (state.inventoryReconciledAt) throw new Error("Inventario ya conciliado.");
  return reconcilePaperHandoff(state.am.count, state.pm.count);
}

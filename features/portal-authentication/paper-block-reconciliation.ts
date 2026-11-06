/**
 * Pure validation for per-box, per-block paper handoffs.
 * No inventory writes are performed here. Master stock must be reconciled once,
 * separately, after the last block has been verified.
 */
export type PaperBlockCount = Readonly<{
  projectId: string;
  boxId: string;
  blockId: string;
  operatorAssignmentId: string;
  opening: number;
  reloads: number;
  remaining: number;
}>;

function natural(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} debe ser un entero no negativo.`);
  }
}

export function reconcilePaperBlock(count: PaperBlockCount) {
  for (const field of ["projectId", "boxId", "blockId", "operatorAssignmentId"] as const) {
    if (!count[field]?.trim()) throw new Error(`Falta ${field}.`);
  }
  natural(count.opening, "Papel inicial");
  natural(count.reloads, "Recargas");
  natural(count.remaining, "Saldo final");
  const available = count.opening + count.reloads;
  if (!Number.isSafeInteger(available)) throw new Error("Saldo disponible fuera de rango.");
  if (count.remaining > available) throw new Error("Saldo final mayor al papel disponible.");
  return {
    ...count,
    used: available - count.remaining,
    available,
    identity: [count.projectId, count.boxId, count.blockId].join(":"),
  };
}

export function reconcilePaperHandoff(am: PaperBlockCount, pm: PaperBlockCount) {
  const first = reconcilePaperBlock(am);
  const second = reconcilePaperBlock(pm);
  if (first.projectId !== second.projectId || first.boxId !== second.boxId) {
    throw new Error("El relevo debe corresponder al mismo evento y caja.");
  }
  if (first.blockId === second.blockId) throw new Error("AM y PM deben ser bloques diferentes.");
  if (first.remaining !== second.opening) {
    throw new Error(`Saldo AM (${first.remaining}) distinto de apertura PM (${second.opening}). Requiere ajuste documentado.`);
  }
  return {
    projectId: first.projectId,
    boxId: first.boxId,
    opening: first.opening,
    reloads: first.reloads + second.reloads,
    remaining: second.remaining,
    used: first.used + second.used,
    blocks: [first, second] as const,
  };
}

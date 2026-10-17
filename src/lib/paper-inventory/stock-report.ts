import { reconcilePaperLedger } from "./reconcile.ts";
import { isWarehousePaperSku, type WarehousePaperSku, WAREHOUSE_PAPER_SKUS } from "./format-map.ts";
import type { PaperMovement } from "./domain.ts";

export interface PaperStockLine {
  sku: WarehousePaperSku;
  label: string;
  warehouse: number;
  boxes: number;
  consumed: number;
  lowStock: boolean;
}

/** Pure report builder; caller must supply the COMPLETE, validated ledger. */
export function buildPaperStockReport(
  movements: readonly PaperMovement[],
  minimumBySku: Partial<Record<WarehousePaperSku, number>> = {},
): { lines: PaperStockLine[]; totalWarehouse: number; totalBoxes: number; totalConsumed: number } {
  for (const movement of movements) {
    if (!isWarehousePaperSku(movement.format)) throw new Error(`Unknown warehouse paper SKU: ${movement.format}`);
  }
  const reconciled = reconcilePaperLedger(movements);
  const lines = (Object.keys(WAREHOUSE_PAPER_SKUS) as WarehousePaperSku[]).map(sku => {
    const warehouse = reconciled.balances[JSON.stringify(["warehouse", sku])] ?? 0;
    let boxes = 0;
    for (const [key, quantity] of Object.entries(reconciled.balances)) {
      const [location, format] = JSON.parse(key) as [string, string];
      if (location.startsWith("box:") && format === sku) boxes += quantity;
    }
    const consumed = movements.filter(m => m.format === sku && m.kind === "consumption")
      .filter((m, i, arr) => arr.findIndex(other => other.idempotencyKey === m.idempotencyKey) === i)
      .reduce((sum, m) => sum + m.quantity, 0);
    const minimum = minimumBySku[sku] ?? 0;
    if (!Number.isSafeInteger(minimum) || minimum < 0) throw new Error("Invalid low-stock threshold");
    return { sku, label: WAREHOUSE_PAPER_SKUS[sku].label, warehouse, boxes, consumed, lowStock: warehouse <= minimum };
  });
  return {
    lines,
    totalWarehouse: reconciled.warehouseTotal,
    totalBoxes: reconciled.boxesTotal,
    totalConsumed: reconciled.consumedTotal,
  };
}

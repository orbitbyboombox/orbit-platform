import { WAREHOUSE_PAPER_SKUS, type WarehousePaperSku } from "./format-map";
import type { PaperBalances } from "./domain";

export const BOX_PAPER_LOW_THRESHOLD = 100;
export interface BoxPaperAlert { boxNumber: string; sku: WarehousePaperSku; remaining: number; message: string }

/** Only below 100 prints: 99 or fewer. */
export function getLowBoxPaperAlerts(balances: PaperBalances): BoxPaperAlert[] {
  const alerts: BoxPaperAlert[] = [];
  for (const [key, quantity] of Object.entries(balances)) {
    const [location, sku] = JSON.parse(key) as [string, string];
    if (!location.startsWith("box:") || !(sku in WAREHOUSE_PAPER_SKUS)) continue;
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("Invalid box stock");
    if (quantity >= BOX_PAPER_LOW_THRESHOLD) continue;
    const boxNumber = location.slice(4);
    alerts.push({ boxNumber, sku: sku as WarehousePaperSku, remaining: quantity,
      message: `Falta cargar papel de bodega a caja número ${boxNumber}` });
  }
  return alerts.sort((a, b) => a.remaining - b.remaining || a.boxNumber.localeCompare(b.boxNumber));
}

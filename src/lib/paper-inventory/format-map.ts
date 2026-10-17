/** Existing ORBIT catalog uses PHOTO_10X15 / PHOTO_5X15 / PHOTO_7_5X10.
 * Do not conflate paper sizes with cut variants: 10x15 normal vs pre-cut are distinct warehouse SKUs.
 */
export type WarehousePaperSku =
  | "PHOTO_10X15_NORMAL"
  | "PHOTO_10X15_PRECUT"
  | "PHOTO_5X15"
  | "PHOTO_7_5X10";

export const WAREHOUSE_PAPER_SKUS: Readonly<Record<WarehousePaperSku, { label: string; orbitFormatKey: string }>> = {
  PHOTO_10X15_NORMAL: { label: "10×15 normal (4×6)", orbitFormatKey: "PHOTO_10X15" },
  PHOTO_10X15_PRECUT: { label: "10×15 prepicado (4×6)", orbitFormatKey: "PHOTO_10X15" },
  PHOTO_5X15: { label: "5×15 Classic", orbitFormatKey: "PHOTO_5X15" },
  PHOTO_7_5X10: { label: "7,5×10 Polaroid", orbitFormatKey: "PHOTO_7_5X10" },
};

export function isWarehousePaperSku(value: string): value is WarehousePaperSku {
  return Object.prototype.hasOwnProperty.call(WAREHOUSE_PAPER_SKUS, value);
}

export function getOrbitFormatKey(sku: WarehousePaperSku): string {
  return WAREHOUSE_PAPER_SKUS[sku].orbitFormatKey;
}

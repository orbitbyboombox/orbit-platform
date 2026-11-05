import type { EventTotemLayout } from "./event-totem-layout";

export type TotemRosterRow = {
  position: string;
  location: string;
  reference: string;
  box: string;
  operator: string;
};
export type TotemRosterBlock = { blockId: string; title: string; rows: TotemRosterRow[] };

/** Presentation-only rows for the existing premium event roster PDF.
 * No payroll, reservation, inventory, or paper counters are modified. */
export function buildEventTotemRoster(
  layout: EventTotemLayout,
  blocks: ReadonlyArray<{ id: string; name: string }>,
  boxNames: ReadonlyMap<string, string>,
  operatorNames: ReadonlyMap<string, string>,
): TotemRosterBlock[] {
  if (!layout.enabled || !Array.isArray(layout.positions)) return [];
  return blocks.map(block => ({
    blockId: block.id,
    title: block.name,
    rows: layout.positions.map(position => ({
      position: position.label,
      location: position.location || "Por definir",
      reference: position.reference || "—",
      box: position.assetId ? boxNames.get(position.assetId) ?? "Caja sin identificar" : "Sin asignar",
      operator: (() => {
        const id = position.blocks.find(item => item.blockId === block.id)?.assignmentId;
        return id ? operatorNames.get(id) ?? "Operador sin identificar" : "Pendiente";
      })(),
    })),
  }));
}

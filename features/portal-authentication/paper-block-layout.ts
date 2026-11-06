/**
 * Resolve paper ownership from existing event layout, never from display names.
 * The caller MUST independently verify each assignment and asset against DB.
 */
export type PaperPosition = Readonly<{
  id: string;
  assetId: string;
  blocks: ReadonlyArray<{ blockId: string; assignmentId: string }>;
}>;

export function resolvePaperBlockLayout(
  positions: readonly PaperPosition[],
  expectedBlockIds: readonly string[],
) {
  if (!expectedBlockIds.length || new Set(expectedBlockIds).size !== expectedBlockIds.length) {
    throw new Error("Bloques operacionales inválidos.");
  }
  const assets = new Set<string>();
  const assignments = new Set<string>();
  const rows: Array<{ assetId: string; positionId: string; blockId: string; assignmentId: string }> = [];
  for (const position of positions) {
    if (!position.id?.trim() || !position.assetId?.trim() || assets.has(position.assetId)) {
      throw new Error("Caja faltante o duplicada.");
    }
    assets.add(position.assetId);
    if (position.blocks.length !== expectedBlockIds.length) throw new Error("Faltan turnos de la caja.");
    const seenBlocks = new Set<string>();
    for (const block of position.blocks) {
      if (!expectedBlockIds.includes(block.blockId) || seenBlocks.has(block.blockId)) {
        throw new Error("Bloque duplicado o desconocido.");
      }
      if (!block.assignmentId?.trim() || assignments.has(block.assignmentId)) {
        throw new Error("Asignación duplicada o ausente.");
      }
      seenBlocks.add(block.blockId);
      assignments.add(block.assignmentId);
      rows.push({ assetId: position.assetId, positionId: position.id, blockId: block.blockId, assignmentId: block.assignmentId });
    }
  }
  return rows;
}

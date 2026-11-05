/** Optional event-level layout. Does not mutate asset inventory or payroll. */
export type TotemPosition = {
  id: string;
  label: string;
  location: string;
  reference: string;
  assetId: string | null;
  blocks: { blockId: string; assignmentId: string | null }[];
};

export type EventTotemLayout = {
  enabled: boolean;
  positions: TotemPosition[];
};

export function emptyTotemLayout(count = 7): EventTotemLayout {
  if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error("Invalid totem count");
  return {
    enabled: false,
    positions: Array.from({ length: count }, (_, i) => ({
      id: `totem-${i + 1}`,
      label: `Tótem ${i + 1}`,
      location: "",
      reference: "",
      assetId: null,
      blocks: [],
    })),
  };
}

/** Validate layout against the existing event's actual asset, block and staff assignment IDs. */
export function validateTotemLayout(layout: EventTotemLayout, context: {
  assetIds: ReadonlySet<string>;
  blockIds: ReadonlySet<string>;
  assignmentBlockIds: ReadonlyMap<string, string>;
}): string[] {
  if (!layout.enabled) return [];
  const errors: string[] = [];
  const positionIds = new Set<string>();
  const assetIds = new Set<string>();
  const usedAssignments = new Set<string>();
  for (const position of layout.positions) {
    if (positionIds.has(position.id)) errors.push(`Duplicate position: ${position.id}`);
    positionIds.add(position.id);
    if (position.assetId) {
      if (!context.assetIds.has(position.assetId)) errors.push(`Unknown asset: ${position.assetId}`);
      if (assetIds.has(position.assetId)) errors.push(`Duplicate physical box: ${position.assetId}`);
      assetIds.add(position.assetId);
    }
    const usedBlocks = new Set<string>();
    for (const block of position.blocks) {
      if (!context.blockIds.has(block.blockId)) errors.push(`Unknown block: ${block.blockId}`);
      if (usedBlocks.has(block.blockId)) errors.push(`Duplicate block for ${position.id}: ${block.blockId}`);
      usedBlocks.add(block.blockId);
      if (block.assignmentId) {
        if (context.assignmentBlockIds.get(block.assignmentId) !== block.blockId) errors.push(`Assignment does not belong to block: ${block.assignmentId}`);
        if (usedAssignments.has(block.assignmentId)) errors.push(`Assignment used twice: ${block.assignmentId}`);
        usedAssignments.add(block.assignmentId);
      }
    }
  }
  return errors;
}

/** Staff may only receive positions assigned to their existing event assignment IDs. */
export function totemsForStaff(layout: EventTotemLayout, assignmentIds: ReadonlySet<string>): TotemPosition[] {
  if (!layout.enabled) return [];
  return layout.positions.filter(position => position.blocks.some(block => block.assignmentId !== null && assignmentIds.has(block.assignmentId)));
}

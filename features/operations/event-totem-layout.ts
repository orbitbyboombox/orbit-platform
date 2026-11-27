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
  /** True only after every active service operator has a physical CASE. */
  finalized?: boolean;
};

export function emptyTotemLayout(count = 7): EventTotemLayout {
  if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error("Invalid totem count");
  return {
    enabled: false,
    finalized: false,
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

export type TotemOperatorAssignment = {
  id: string;
  blockId: string | null;
  assignmentType: string;
};

export type TotemAssignmentOption = TotemOperatorAssignment & { label: string };

/**
 * Prepare the administrative draft without changing persistence. Existing
 * assignments always win; only empty positions/turns are filled with the
 * already-confirmed service operators in stable order.
 */
export function prepareTotemDraft(
  layout: EventTotemLayout,
  blocks: readonly { id: string }[],
  assignments: readonly TotemAssignmentOption[],
  requiredCaseCount: number,
): EventTotemLayout {
  const count = Math.max(1, Math.min(30, requiredCaseCount || layout.positions.length));
  const positions = Array.from({ length: count }, (_, index) => layout.positions[index] ?? ({
    id: `totem-${index + 1}`,
    label: `Tótem ${index + 1}`,
    location: "",
    reference: "",
    assetId: null,
    blocks: [],
  }));
  const operatorsByBlock = new Map<string, TotemAssignmentOption[]>();
  for (const assignment of assignments.filter(item => item.assignmentType === "OPERATOR")) {
    for (const block of blocks) {
      // An event-level operator is unambiguous only when the event has one
      // operational block. Multi-block events keep the operator selectable so
      // the administrator can choose the correct shift without duplication.
      if (assignment.blockId === block.id || (assignment.blockId === null && blocks.length === 1)) {
        const current = operatorsByBlock.get(block.id) ?? [];
        if (!current.some(item => item.id === assignment.id)) current.push(assignment);
        operatorsByBlock.set(block.id, current);
      }
    }
  }
  const usedByBlock = new Map<string, Set<string>>();
  return {
    ...layout,
    positions: positions.map((position) => ({
      ...position,
      blocks: blocks.map(block => {
        const existing = position.blocks.find(item => item.blockId === block.id);
        if (existing?.assignmentId) return existing;
        const used = usedByBlock.get(block.id) ?? new Set<string>();
        const candidate = (operatorsByBlock.get(block.id) ?? []).find(item => !used.has(item.id));
        if (candidate) used.add(candidate.id);
        usedByBlock.set(block.id, used);
        return { blockId: block.id, assignmentId: candidate?.id ?? null };
      }),
    })),
  };
}

/** Return controlled blockers for finalization; drafts may remain incomplete. */
export function getTotemFinalizationWarnings(
  layout: EventTotemLayout,
  assignments: readonly TotemOperatorAssignment[],
  blockIds: ReadonlySet<string>,
  requiredCaseCount?: number,
): string[] {
  const warnings: string[] = [];
  if (!layout.enabled) return ["Activa Multicaja antes de finalizar."];
  const operators = assignments.filter(item => item.assignmentType === "OPERATOR");
  const positions = layout.positions.filter(position => position.assetId);
  if (!positions.length) warnings.push("Asigna al menos una caja antes de finalizar.");
  if (requiredCaseCount !== undefined && positions.length < requiredCaseCount) {
    warnings.push(`Faltan cajas: ${positions.length}/${requiredCaseCount} asignadas.`);
  }
  if (!operators.length) warnings.push("Falta asignar operadores de servicio.");

  const singleOperatorSingleBox = blockIds.size === 0 && positions.length === 1 && operators.length === 1;
  if (singleOperatorSingleBox) return warnings;

  for (const operator of operators) {
    const mapped = positions.some(position => position.blocks.some(shift =>
      shift.assignmentId === operator.id &&
      (operator.blockId === null || operator.blockId === shift.blockId) &&
      blockIds.has(shift.blockId),
    ));
    if (!mapped) warnings.push("Hay operadores de servicio pendientes de vincular a una caja y bloque.");
  }
  for (const position of positions) {
    const mapped = position.blocks.some(shift =>
      shift.assignmentId !== null &&
      blockIds.has(shift.blockId) &&
      operators.some(operator => operator.id === shift.assignmentId && (operator.blockId === null || operator.blockId === shift.blockId)),
    );
    if (!mapped) warnings.push(`${position.label}: asigna un operador de servicio a esta caja.`);
  }
  return [...new Set(warnings)];
}

/** Validate layout against the existing event's actual asset, block and staff assignment IDs. */
export function validateTotemLayout(layout: EventTotemLayout, context: {
  assetIds: ReadonlySet<string>;
  blockIds: ReadonlySet<string>;
  /** null means an active event-level operator that the authenticated save can link. */
  assignmentBlockIds: ReadonlyMap<string, string | null>;
}): string[] {
  if (!layout || typeof layout !== "object" || typeof layout.enabled !== "boolean") return ["Invalid layout"];
  if (!Array.isArray(layout.positions)) return ["Invalid position count"];
  if (!layout.enabled) return [];
  const errors: string[] = [];
  if (!Array.isArray(layout.positions) || layout.positions.length === 0 || layout.positions.length > 30) return ["Invalid position count"];
  const positionIds = new Set<string>();
  const assetIds = new Set<string>();
  const usedAssignments = new Set<string>();
  for (const position of layout.positions) {
    if (!position || typeof position !== "object" || typeof position.id !== "string" || typeof position.label !== "string" || typeof position.location !== "string" || typeof position.reference !== "string" || (position.assetId !== null && typeof position.assetId !== "string")) { errors.push("Invalid position structure"); continue; }
    if (!position.id || !position.label || position.label.length > 100 || position.location.length > 250 || position.reference.length > 250) errors.push(`Invalid position fields: ${position.id}`);
    if (positionIds.has(position.id)) errors.push(`Duplicate position: ${position.id}`);
    positionIds.add(position.id);
    if (position.assetId) {
      if (!context.assetIds.has(position.assetId)) errors.push(`Unknown asset: ${position.assetId}`);
      if (assetIds.has(position.assetId)) errors.push(`Duplicate physical box: ${position.assetId}`);
      assetIds.add(position.assetId);
    }
    const usedBlocks = new Set<string>();
    if (!Array.isArray(position.blocks)) { errors.push(`Invalid blocks: ${position.id}`); continue; }
    for (const block of position.blocks) {
      if (!block || typeof block.blockId !== "string" || (block.assignmentId !== null && typeof block.assignmentId !== "string")) { errors.push(`Invalid block structure: ${position.id}`); continue; }
      if (!context.blockIds.has(block.blockId)) errors.push(`Unknown block: ${block.blockId}`);
      if (usedBlocks.has(block.blockId)) errors.push(`Duplicate block for ${position.id}: ${block.blockId}`);
      usedBlocks.add(block.blockId);
      if (block.assignmentId) {
        const assignmentBlockId = context.assignmentBlockIds.get(block.assignmentId);
        if (!context.assignmentBlockIds.has(block.assignmentId) || (assignmentBlockId !== null && assignmentBlockId !== block.blockId)) errors.push(`Assignment does not belong to block: ${block.assignmentId}`);
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

export function visibleTotemsForStaff(layout: EventTotemLayout, assignmentIds: ReadonlySet<string>, supervisor: boolean): TotemPosition[] {
  if (!layout.enabled || !Array.isArray(layout.positions)) return [];
  return supervisor ? layout.positions : totemsForStaff(layout, assignmentIds);
}

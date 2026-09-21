/**
 * Canonical operational-block domain rules.
 *
 * Blocks are an internal planning projection only: they never change the
 * commercial quote, reservation, Drive folder or the single Calendar event.
 * Timestamps are stored as instants (timestamptz) and displayed in
 * America/Santiago by the UI.
 */

export const OPERATIONAL_BLOCK_TIME_ZONE = "America/Santiago" as const;

export type OperationalBlockStatus =
  | "PLANNING"
  | "STAFF_INCOMPLETE"
  | "RESOURCE_INCOMPLETE"
  | "READY"
  | "COMPLETED";

export type OperationalBlock = {
  id: string;
  projectId: string;
  name: string;
  sequence: number;
  startAt: string;
  endAt: string;
  status: OperationalBlockStatus;
  notes?: string | null;
};

export type OperationalGap = {
  startAt: string;
  endAt: string;
  durationMinutes: number;
  label: "PAUSE";
};

export type ResourceSegment = {
  blockId: string;
  resourceType: string;
  quantity: number;
  startAt: string;
  endAt: string;
};

export type StaffBlockAssignment = {
  id: string;
  staffId: string;
  blockId: string;
  role: string;
  startAt: string;
  endAt: string;
};

export type BlockCostResolution = {
  blockId: string;
  amount: number | null;
  status: "RESOLVED" | "REVIEW_REQUIRED";
};

const instant = (value: string): number => {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("Fecha operacional inválida.");
  return result;
};

export function validateOperationalBlock(block: Pick<OperationalBlock, "name" | "startAt" | "endAt">): string[] {
  const errors: string[] = [];
  if (!block.name.trim()) errors.push("El bloque necesita un nombre.");
  const start = instant(block.startAt);
  const end = instant(block.endAt);
  if (end <= start) errors.push("El fin del bloque debe ser posterior al inicio.");
  if (start % 60_000 !== 0 || end % 60_000 !== 0) errors.push("Los bloques se guardan con precisión de minuto.");
  return errors;
}

export function sortOperationalBlocks(blocks: readonly OperationalBlock[]): OperationalBlock[] {
  return [...blocks].sort((a, b) => instant(a.startAt) - instant(b.startAt) || a.sequence - b.sequence);
}

export function calculateOperationalGaps(blocks: readonly OperationalBlock[]): OperationalGap[] {
  const sorted = sortOperationalBlocks(blocks);
  const gaps: OperationalGap[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previousEnd = instant(sorted[index - 1].endAt);
    const nextStart = instant(sorted[index].startAt);
    if (nextStart > previousEnd) {
      gaps.push({
        startAt: sorted[index - 1].endAt,
        endAt: sorted[index].startAt,
        durationMinutes: Math.round((nextStart - previousEnd) / 60_000),
        label: "PAUSE",
      });
    }
  }
  return gaps;
}

/** Weighted sweep-line peak. Adjacent blocks do not overlap. */
export function calculatePeakConcurrent(segments: readonly ResourceSegment[]): number {
  const points = segments.flatMap((segment) => [
    { at: instant(segment.startAt), delta: Math.max(0, segment.quantity), order: 1 },
    { at: instant(segment.endAt), delta: -Math.max(0, segment.quantity), order: 0 },
  ]).sort((a, b) => a.at - b.at || a.order - b.order);
  let current = 0;
  let peak = 0;
  for (const point of points) {
    current = Math.max(0, current + point.delta);
    peak = Math.max(peak, current);
  }
  return peak;
}

export function findStaffBlockConflicts(assignments: readonly StaffBlockAssignment[]): StaffBlockAssignment[][] {
  const conflicts: StaffBlockAssignment[][] = [];
  const byStaff = new Map<string, StaffBlockAssignment[]>();
  for (const assignment of assignments) byStaff.set(assignment.staffId, [...(byStaff.get(assignment.staffId) ?? []), assignment]);
  for (const staffAssignments of byStaff.values()) {
    const sorted = [...staffAssignments].sort((a, b) => instant(a.startAt) - instant(b.startAt));
    for (let index = 1; index < sorted.length; index += 1) {
      if (instant(sorted[index].startAt) < instant(sorted[index - 1].endAt)) {
        conflicts.push([sorted[index - 1], sorted[index]]);
      }
    }
  }
  return conflicts;
}

export function resolveBlockStaffCosts(resolutions: readonly BlockCostResolution[]): { status: "RESOLVED" | "REVIEW_REQUIRED"; total: number | null } {
  if (resolutions.some((item) => item.status === "REVIEW_REQUIRED" || item.amount === null)) {
    return { status: "REVIEW_REQUIRED", total: null };
  }
  return { status: "RESOLVED", total: resolutions.reduce((sum, item) => sum + Number(item.amount), 0) };
}

/** Guardrail for the one-commercial-event invariant. */
export function assertSingleCommercialEvent(invariants: { quoteId: string; reservationId: string; calendarEventCount: number }): true {
  if (!invariants.quoteId || !invariants.reservationId || invariants.calendarEventCount !== 1) {
    throw new Error("Los bloques operacionales no pueden crear eventos comerciales adicionales.");
  }
  return true;
}

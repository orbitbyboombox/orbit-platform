export type OperatorBlockRequirement = {
  blockId: string;
  required: number;
  assigned: number;
  rate?: number | null;
};

export type OperatorBlockAssignment = {
  blockId?: string | null;
  staffId: string;
  role: string;
  status: string;
};

export type OperatorBlockSettlement = {
  blockId?: string | null;
  staffId: string;
  roles: string[];
  finalAmount: number;
  settlementStatus?: string;
};

export function buildOperatorBlockSummary(
  requirements: readonly OperatorBlockRequirement[],
  assignments: readonly OperatorBlockAssignment[],
  settlements: readonly OperatorBlockSettlement[],
) {
  const active = assignments.filter(
    (item) =>
      item.role === "OPERATOR" &&
      item.blockId &&
      !["CANCELLED", "REJECTED"].includes(item.status),
  );
  const activeByBlock = new Map<string, Set<string>>();
  for (const assignment of active) {
    const staff = activeByBlock.get(assignment.blockId!) ?? new Set<string>();
    staff.add(assignment.staffId);
    activeByBlock.set(assignment.blockId!, staff);
  }
  const settlementByBlockAndStaff = new Map<string, number>();
  for (const settlement of settlements) {
    if (!settlement.blockId || !settlement.roles.includes("OPERATOR")) continue;
    settlementByBlockAndStaff.set(
      `${settlement.blockId}:${settlement.staffId}`,
      Number(settlement.finalAmount ?? 0),
    );
  }
  const blocks = requirements.map((requirement) => {
    const assignedStaff = activeByBlock.get(requirement.blockId) ?? new Set<string>();
    const assigned = assignedStaff.size;
    const currentCost = [...assignedStaff].reduce(
      (sum, staffId) =>
        sum +
        (settlementByBlockAndStaff.get(`${requirement.blockId}:${staffId}`) ??
          Number(requirement.rate ?? 0)),
      0,
    );
    return {
      blockId: requirement.blockId,
      assigned,
      required: Math.max(0, Number(requirement.required ?? 0)),
      pending: Math.max(0, Number(requirement.required ?? 0) - assigned),
      currentCost,
      projectedCost: Math.max(0, Number(requirement.required ?? 0)) * Number(requirement.rate ?? 0),
    };
  });
  const unscopedAssigned = new Set(
    assignments
      .filter(
        (item) =>
          item.role === "OPERATOR" &&
          !item.blockId &&
          !["CANCELLED", "REJECTED"].includes(item.status),
      )
      .map((item) => item.staffId),
  ).size;
  return {
    blocks,
    totalAssigned: blocks.reduce((sum, block) => sum + block.assigned, 0),
    totalRequired: blocks.reduce((sum, block) => sum + block.required, 0),
    pending: blocks.reduce((sum, block) => sum + block.pending, 0),
    currentCost: blocks.reduce((sum, block) => sum + block.currentCost, 0),
    projectedCost: blocks.reduce((sum, block) => sum + block.projectedCost, 0),
    unscopedAssigned,
  };
}

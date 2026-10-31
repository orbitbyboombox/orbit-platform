export const STAFF_PAYMENT_CONCEPTS = [
  "OPERATOR",
  "SUPERVISOR",
  "ASSEMBLY",
  "DISASSEMBLY",
  "TRAINING",
] as const;

export type StaffPaymentConcept = (typeof STAFF_PAYMENT_CONCEPTS)[number];

export type CanonicalStaffPaymentItem = {
  id: string;
  projectId: string;
  staffId: string;
  assignmentId?: string | null;
  concept: StaffPaymentConcept;
  amount: number;
  paidAmount?: number;
  status: string;
  source: "LEGACY_SETTLEMENT" | "PAYMENT_ITEM";
};

export type StaffFinancialAssignment = {
  id: string;
  /** Defensive scope carried from the database read model. */
  projectId?: string;
  staffId: string;
  role: string;
  status: string;
};

export type CanonicalStaffFinancials = {
  items: CanonicalStaffPaymentItem[];
  byConcept: Record<StaffPaymentConcept, number>;
  total: number;
  paid: number;
  reviewRequiredAssignmentIds: string[];
};

const ACTIVE_ASSIGNMENT_STATUSES = new Set([
  "ASSIGNED",
  "PENDING",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "EVENT_STARTED",
  "EVENT_FINISHED",
  "COMPLETED",
]);

const toAmount = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

const conceptFromRole = (role: string): StaffPaymentConcept | null => {
  const normalized = role.toUpperCase();
  if (normalized === "CAPACITACION" || normalized === "CAPACITACIÓN") return "TRAINING";
  if (STAFF_PAYMENT_CONCEPTS.includes(normalized as StaffPaymentConcept)) {
    return normalized as StaffPaymentConcept;
  }
  return null;
};

export function buildCanonicalStaffFinancials(input: {
  projectId: string;
  settlements: Array<{
    id: string;
    staffId: string;
    assignmentId?: string | null;
    status: string;
    operatorPayment?: unknown;
    assemblyPayment?: unknown;
    disassemblyPayment?: unknown;
    paidAmount?: unknown;
  }>;
  paymentItems?: CanonicalStaffPaymentItem[];
  assignments: StaffFinancialAssignment[];
}): CanonicalStaffFinancials {
  const items: CanonicalStaffPaymentItem[] = [];
  const scopedAssignments = input.assignments.filter(
    (assignment) => assignment.projectId == null || assignment.projectId === input.projectId,
  );
  const assignmentsByStaff = new Map<string, StaffFinancialAssignment[]>();
  const assignmentsById = new Map<string, StaffFinancialAssignment>();
  for (const assignment of scopedAssignments) {
    assignmentsById.set(assignment.id, assignment);
    const list = assignmentsByStaff.get(assignment.staffId) ?? [];
    list.push(assignment);
    assignmentsByStaff.set(assignment.staffId, list);
  }
  const legacyMap: Array<[StaffPaymentConcept, keyof (typeof input.settlements)[number]]> = [
    ["OPERATOR", "operatorPayment"],
    ["ASSEMBLY", "assemblyPayment"],
    ["DISASSEMBLY", "disassemblyPayment"],
  ];

  for (const settlement of input.settlements) {
    if (["CANCELLED", "DELETED"].includes(settlement.status)) continue;
    for (const [legacyConcept, field] of legacyMap) {
      const amount = toAmount(settlement[field]);
      if (amount <= 0) continue;
      // Resolve the concept from the exact assignment first. Inferring a role
      // from the collaborator's other assignments turns a supervisor row into
      // an operator row and can duplicate or omit money.
      const assignment = settlement.assignmentId
        ? assignmentsById.get(settlement.assignmentId)
        : undefined;
      const concept =
        field === "operatorPayment" && assignment?.role === "SUPERVISOR"
          ? "SUPERVISOR"
          : conceptFromRole(legacyConcept) ?? "OPERATOR";
      items.push({
        id: `${settlement.id}:${concept}`,
        projectId: input.projectId,
        // Legacy rows can carry a stale staff_id after an assignment was
        // replaced. Once assignment_id is present, the assignment's staff is
        // the only safe owner for the financial line.
        staffId: assignment?.staffId ?? settlement.staffId,
        assignmentId: settlement.assignmentId ?? null,
        concept,
        amount,
        paidAmount: Math.min(toAmount(settlement.paidAmount), amount),
        status: settlement.status,
        source: "LEGACY_SETTLEMENT",
      });
    }
  }

  for (const item of (input.paymentItems ?? []).filter((candidate) => candidate.projectId === input.projectId)) {
    if (!["CANCELLED", "DELETED"].includes(item.status)) items.push(item);
  }

  // A migrated payment item supersedes the legacy column for the same
  // assignment/concept. This makes retries and a gradual migration safe.
  const itemKeys = new Set(
    items
      .filter((item) => item.source === "PAYMENT_ITEM" && item.assignmentId)
      .map((item) => `${item.assignmentId}:${item.concept}`),
  );
  const unassignedItemKeys = new Set(
    items
      .filter((item) => item.source === "PAYMENT_ITEM" && !item.assignmentId)
      .map((item) => `${item.staffId}:${item.concept}`),
  );
  const dedupedItems = items.filter(
    (item) =>
      item.source !== "LEGACY_SETTLEMENT" ||
      (item.assignmentId
        ? !itemKeys.has(`${item.assignmentId}:${item.concept}`)
        : !unassignedItemKeys.has(`${item.staffId}:${item.concept}`)),
  );

  const byConcept = Object.fromEntries(
    STAFF_PAYMENT_CONCEPTS.map((concept) => [concept, 0]),
  ) as Record<StaffPaymentConcept, number>;
  for (const item of dedupedItems) byConcept[item.concept] += toAmount(item.amount);

  const linkedAssignmentIds = new Set(
    dedupedItems.map((item) => item.assignmentId).filter(Boolean) as string[],
  );
  const coveredStaffConcepts = new Set(
    dedupedItems.map((item) => `${item.staffId}:${item.concept}`),
  );
  const reviewRequiredAssignmentIds = scopedAssignments
    .filter((assignment) => ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status))
    .filter((assignment) => Boolean(conceptFromRole(assignment.role)))
    .filter((assignment) => {
      const concept = conceptFromRole(assignment.role);
      return concept
        ? !linkedAssignmentIds.has(assignment.id) && !coveredStaffConcepts.has(`${assignment.staffId}:${concept}`)
        : false;
    })
    .map((assignment) => assignment.id);

  return {
    items: dedupedItems,
    byConcept,
    total: Object.values(byConcept).reduce((sum, amount) => sum + amount, 0),
    paid: dedupedItems.reduce((sum, item) => sum + Math.min(toAmount(item.paidAmount), toAmount(item.amount)), 0),
    reviewRequiredAssignmentIds,
  };
}

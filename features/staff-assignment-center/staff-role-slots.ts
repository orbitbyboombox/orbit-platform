export type StaffSlotAssignment = {
  id: string;
  staffId: string;
  role: string;
  status: string;
  createdAt?: string;
};

/** Vacancies are demand projections; occupied slots are canonical assignments. */
export function buildStaffRoleSlots<T extends StaffSlotAssignment>(
  role: string,
  required: number,
  assignments: readonly T[],
  window?: { offset: number; limit: number },
) {
  const seen = new Set<string>();
  const active = assignments
    .filter((item) => item.role === role && !["CANCELLED", "REJECTED"].includes(item.status))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id))
    .filter((item) => {
      if (seen.has(item.staffId)) return false;
      seen.add(item.staffId);
      return true;
    });
  const total = Math.max(required, active.length);
  const offset = window?.offset ?? 0;
  const length = Math.max(0, Math.min(window?.limit ?? total, total - offset));
  return Array.from({ length }, (_, index) => ({
    number: offset + index + 1,
    assignment: active[offset + index] ?? null,
  }));
}

export function validStaffQuantity(value: number) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 99;
}

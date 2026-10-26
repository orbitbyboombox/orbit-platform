export type CanonicalBoxAssignmentLike = {
  id?: string | null;
  assignment_status?: string | null;
  deleted_at?: string | null;
  assigned_at?: string | null;
  returned_at?: string | null;
  asset_id?: string | null;
  operational_assets?: { asset_code?: string | null; asset_type?: string | null } | { asset_code?: string | null; asset_type?: string | null }[] | null;
};

const activeStatuses = new Set(["ASSIGNED", "CONFIRMED", "ACCEPTED", "IN_EVENT"]);

export function canonicalBoxAssignment<T extends CanonicalBoxAssignmentLike>(rows: T[]): T | null {
  const valid = rows.filter((row) => !row.deleted_at && row.id && row.asset_id);
  return [...valid].sort((left, right) => {
    const leftActive = activeStatuses.has(String(left.assignment_status ?? "").toUpperCase()) ? 1 : 0;
    const rightActive = activeStatuses.has(String(right.assignment_status ?? "").toUpperCase()) ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;
    const leftAt = Date.parse(String(left.assigned_at ?? left.returned_at ?? "")) || 0;
    const rightAt = Date.parse(String(right.assigned_at ?? right.returned_at ?? "")) || 0;
    return rightAt - leftAt;
  })[0] ?? null;
}

export function isActiveBoxAssignment(row: CanonicalBoxAssignmentLike | null | undefined): boolean {
  return Boolean(row && activeStatuses.has(String(row.assignment_status ?? "").toUpperCase()));
}

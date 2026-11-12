export type IncidentBoxAssignment = { id: string; asset_id: string; assignment_status: string };
/** Prefer the exact box used by the closeout. Never choose an arbitrary box in a multi-box event. */
export function resolveIncidentBoxAssignment<T extends IncidentBoxAssignment>(candidates: readonly T[], staffSnapshotAssignmentIds: readonly string[], requestedId?: string): T | null {
  const eligible = candidates.filter(row => ['ASSIGNED', 'RETURNED'].includes(row.assignment_status));
  if (requestedId) return eligible.find(row => row.id === requestedId) ?? null;
  const confirmed = eligible.filter(row => staffSnapshotAssignmentIds.includes(row.id));
  if (confirmed.length === 1) return confirmed[0];
  if (confirmed.length > 1) return null;
  return eligible.length === 1 ? eligible[0] : null;
}

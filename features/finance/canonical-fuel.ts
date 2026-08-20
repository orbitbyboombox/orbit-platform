export type CanonicalFuelCandidate = {
  id: string;
  receiptPath: string | null;
  gasStation: string | null;
  routeId: string | null;
  routeStatus: string | null;
  routeDeletedAt: string | null;
  routeNotes: string | null;
  hasActiveProductionProject: boolean;
};

const normalizedPath = (value: string | null) => value?.trim().toLowerCase() ?? "";
const explicitTestMarker = (value: string | null) => /(^|[\s/_-])test([\s/_-]|$)/i.test(value?.trim() ?? "");

export function selectCanonicalFuelLogs<T extends CanonicalFuelCandidate>(
  rows: readonly T[],
  materializedExpenseReceiptPaths: ReadonlySet<string>,
): T[] {
  const selected: T[] = [];
  const seenReceiptPaths = new Set<string>();
  const expenses = new Set([...materializedExpenseReceiptPaths].map((path) => normalizedPath(path)));

  for (const row of rows) {
    const receiptPath = normalizedPath(row.receiptPath);
    const structurallyActive = Boolean(
      row.routeId
      && row.routeStatus === "ACTIVE"
      && !row.routeDeletedAt
      && row.hasActiveProductionProject,
    );
    const explicitlyTest = explicitTestMarker(row.receiptPath)
      || explicitTestMarker(row.gasStation)
      || explicitTestMarker(row.routeNotes);

    if (!receiptPath || !structurallyActive || explicitlyTest) continue;
    if (expenses.has(receiptPath) || seenReceiptPaths.has(receiptPath)) continue;
    seenReceiptPaths.add(receiptPath);
    selected.push(row);
  }

  return selected;
}

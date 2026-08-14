export function groupByOwnerId<T extends Record<K, string>, K extends keyof T>(
  rows: readonly T[],
  ownerKey: K,
) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const ownerId = row[ownerKey];
    const owned = grouped.get(ownerId) ?? [];
    owned.push(row);
    grouped.set(ownerId, owned);
  }
  return grouped;
}

const CLOSED_COMMERCIAL_STAGES = new Set([
  "GANADO",
  "PERDIDO",
  "CANCELADO",
  "PRUEBA",
  "ARCHIVADO",
]);

/**
 * Commercial alerts stop being actionable when their pipeline closes. Staff,
 * operations and finance alerts have their own canonical resolution state and
 * must not inherit that commercial visibility rule.
 */
export function isFounderActionVisible(
  notificationType: string,
  projectStage: string,
) {
  if (!notificationType.startsWith("SALES_")) return true;
  return !CLOSED_COMMERCIAL_STAGES.has(projectStage.toUpperCase());
}

export function founderActionHref(
  notificationType: string,
  entityId: string | null,
  storedHref: string | null,
) {
  if (notificationType === "STAFF_EXPENSE_REVIEW_REQUIRED" && entityId) {
    return `/resources/staff?reviewExpense=${encodeURIComponent(entityId)}`;
  }
  return storedHref ?? "/notifications";
}

import "server-only";

/**
 * Smoke mode is deliberately server-side and fixture-scoped. Enabling the
 * environment flag alone never changes normal bookings: the invitation must
 * also be marked as a smoke fixture by trusted server code.
 */
export function isAutomaticBookingSmokeMode(payload?: unknown): boolean {
  if (process.env.AUTOMATIC_BOOKING_SMOKE_MODE?.trim().toLowerCase() !== "true") return false;
  if (!payload || typeof payload !== "object") return false;
  return (payload as Record<string, unknown>).smokeFixture === true;
}

export function smokeSinkId(kind: string, id: string): string {
  return `smoke:${kind}:${id}`;
}

export const FOUNDER_FORCE_DELETE_CONFIRMATION = "ELIMINAR" as const;
export const TEST_FULL_PURGE_CONFIRMATION = "PURGAR PRUEBA" as const;

export function isFounderRole(role: string | null | undefined): boolean {
  return role === "CEO";
}

export function assertFounderForceDeleteConfirmation(value: string | null | undefined): void {
  if (value?.trim().toUpperCase() !== FOUNDER_FORCE_DELETE_CONFIRMATION) {
    throw new Error("Escribe ELIMINAR para confirmar la eliminación definitiva.");
  }
}

export function assertTestFullPurgeConfirmation(value: string | null | undefined): void {
  if (value?.trim().toUpperCase() !== TEST_FULL_PURGE_CONFIRMATION) {
    throw new Error("Escribe PURGAR PRUEBA para confirmar la purga QA.");
  }
}

export function serializeForceDeleteError(error: unknown): { code: string; message: string; details?: unknown } {
  if (error instanceof Error) return { code: "FOUNDER_FORCE_DELETE_FAILED", message: error.message, details: error.stack };
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return { code: typeof value.code === "string" ? value.code : "FOUNDER_FORCE_DELETE_FAILED", message: typeof value.message === "string" ? value.message : JSON.stringify(value), details: value.details ?? value.hint };
  }
  return { code: "FOUNDER_FORCE_DELETE_FAILED", message: String(error) };
}

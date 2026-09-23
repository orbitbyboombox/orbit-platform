export const FOUNDER_FORCE_DELETE_CONFIRMATION = "ELIMINAR" as const;
export const TEST_FULL_PURGE_CONFIRMATION = "PURGAR PRUEBA TOTAL" as const;

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
    throw new Error("Escribe PURGAR PRUEBA TOTAL para confirmar la purga QA.");
  }
}

export function serializeForceDeleteError(error: unknown): { code: string; message: string; details?: unknown } {
  const humanMessage = (message: string): string => {
    if (/timeline_events is append-only|append-only|check constraint|violates foreign key/i.test(message)) {
      return "No fue posible completar la eliminación porque la auditoría histórica está protegida. No se aplicó una eliminación parcial.";
    }
    return message;
  };
  if (error instanceof Error) return { code: "FOUNDER_FORCE_DELETE_FAILED", message: humanMessage(error.message), details: error.stack };
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const message = typeof value.message === "string" ? value.message : JSON.stringify(value);
    return { code: typeof value.code === "string" ? value.code : "FOUNDER_FORCE_DELETE_FAILED", message: humanMessage(message), details: value.details ?? value.hint };
  }
  return { code: "FOUNDER_FORCE_DELETE_FAILED", message: String(error) };
}

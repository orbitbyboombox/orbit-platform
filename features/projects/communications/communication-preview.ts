export async function readCommunicationPreview<T>(
  projectId: string,
  kind: "photos" | "reminder",
): Promise<{ ok: true; preview: T } | { ok: false; error: string }> {
  const signal = AbortSignal.timeout(12_000);
  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/communications/${kind}`,
      { cache: "no-store", signal },
    );
    if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("No fue posible cargar la vista previa. Verifica tu sesión e intenta nuevamente.");
    }
    return await response.json();
  } catch (error) {
    if (signal.aborted) {
      throw new Error("La vista previa está tardando demasiado. Intenta nuevamente.");
    }
    throw error;
  }
}

export async function withCommunicationActionTimeout<T>(promise: Promise<T>, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 15_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

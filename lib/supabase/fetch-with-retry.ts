const POOL_TIMEOUT_CODE = "PGRST003";
const SUPABASE_FETCH_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;

function timeoutResponse() {
  return new Response(JSON.stringify({
    code: POOL_TIMEOUT_CODE,
    message: "Supabase no respondió dentro del presupuesto de transporte; la solicitud se mantiene cerrada.",
    hint: "Reintento controlado agotado",
  }), {
    status: 504,
    headers: { "content-type": "application/json", "x-orbit-supabase-transport-timeout": "1" },
  });
}

export async function fetchWithSupabasePoolRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);
    const callerSignal = init?.signal;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (response.ok) return response;
      const body = await response.clone().text();
      if (!body.includes(POOL_TIMEOUT_CODE) || attempt === MAX_ATTEMPTS - 1) return response;
    } catch (error) {
      const aborted = error instanceof DOMException ? error.name === "AbortError" : error instanceof Error && error.name === "AbortError";
      if (!aborted || callerSignal?.aborted) throw error;
      if (attempt === MAX_ATTEMPTS - 1) return timeoutResponse();
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  return timeoutResponse();
}

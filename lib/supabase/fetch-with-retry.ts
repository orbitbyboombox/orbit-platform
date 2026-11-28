const POOL_TIMEOUT_CODE = "PGRST003";
const AUTH_BUDGET_MS = 7_000;
const NAVIGATION_BUDGET_MS = 11_000;
const ATTEMPT_TIMEOUT_MS = 2_500;
const RETRY_BACKOFF_MS = 150;
const MAX_ATTEMPTS = 3;

function requestBudget(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const requestClass = headers.get("x-orbit-request-class");
  if (requestClass === "auth" || String(input).includes("/auth/v1/")) return AUTH_BUDGET_MS;
  return NAVIGATION_BUDGET_MS;
}

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
  const deadline = Date.now() + requestBudget(input, init);
  const outboundHeaders = new Headers(init?.headers);
  outboundHeaders.delete("x-orbit-request-class");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return timeoutResponse();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(ATTEMPT_TIMEOUT_MS, remaining));
    const callerSignal = init?.signal;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    try {
      const response = await fetch(input, { ...init, headers: outboundHeaders, signal: controller.signal });
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
    const backoff = Math.min(RETRY_BACKOFF_MS * (attempt + 1), Math.max(0, deadline - Date.now()));
    if (backoff > 0) await new Promise((resolve) => setTimeout(resolve, backoff));
  }
  return timeoutResponse();
}

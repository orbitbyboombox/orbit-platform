const POOL_TIMEOUT_CODE = "PGRST003";

export async function fetchWithSupabasePoolRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(input, init);
    if (attempt >= 2 || response.ok) return response;

    const body = await response.clone().text();
    if (!body.includes(POOL_TIMEOUT_CODE)) return response;
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
}

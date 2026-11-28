const POOL_TIMEOUT_CODE = "PGRST003";
const MAX_CONCURRENT_REQUESTS = 8;
let activeRequests = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<() => void> {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  activeRequests += 1;
  return () => {
    activeRequests -= 1;
    waiters.shift()?.();
  };
}

export async function fetchWithSupabasePoolRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const release = await acquireSlot();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    let response: Response;
    try {
      response = await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      release();
    }
    if (attempt >= 2 || response.ok) return response;
    const body = await response.clone().text();
    if (!body.includes(POOL_TIMEOUT_CODE)) return response;
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
}

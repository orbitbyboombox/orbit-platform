export interface RetryPolicy { maxAttempts: number; baseDelayMs: number; maximumDelayMs: number; }
export interface RetryContext { attempt: number; idempotencyKey: string; correlationId: string; }

export const retryDelay = (attempt: number, policy: RetryPolicy): number =>
  Math.min(policy.maximumDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));

export async function withRetry<T>(operation: (context: RetryContext) => Promise<T>, context: Omit<RetryContext, "attempt">, policy: RetryPolicy): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try { return await operation({ ...context, attempt }); }
    catch (error) {
      lastError = error;
      if (attempt < policy.maxAttempts) await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, policy)));
    }
  }
  throw lastError;
}

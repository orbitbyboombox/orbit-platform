import { createSyncRequest } from "../engine";
import type { CreateSyncRequestInput, CreateSyncRequestResult } from "../types";

export function createOperationalSyncRequest(
  input: CreateSyncRequestInput,
): CreateSyncRequestResult {
  return createSyncRequest(input);
}

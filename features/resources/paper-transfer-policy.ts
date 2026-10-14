export type PaperTransferRequest = {
  sourceStock: number;
  requestedQuantity: number;
  destinationBoxId: string;
  sourceLotId: string;
  idempotencyKey: string;
};

/**
 * Shared validation contract for the future Bodega → Caja RPC.
 * This is deliberately pure: it cannot change Supabase or inventory state.
 */
export function validatePaperTransferRequest(request: PaperTransferRequest): string[] {
  const errors: string[] = [];
  if (!request.destinationBoxId.trim()) errors.push("DESTINATION_BOX_REQUIRED");
  if (!request.sourceLotId.trim()) errors.push("SOURCE_LOT_REQUIRED");
  if (!request.idempotencyKey.trim()) errors.push("IDEMPOTENCY_KEY_REQUIRED");
  if (!Number.isFinite(request.requestedQuantity) || request.requestedQuantity <= 0) errors.push("QUANTITY_MUST_BE_POSITIVE");
  if (!Number.isFinite(request.sourceStock) || request.sourceStock < 0) errors.push("SOURCE_STOCK_INVALID");
  if (request.requestedQuantity > request.sourceStock) errors.push("INSUFFICIENT_SOURCE_STOCK");
  return errors;
}


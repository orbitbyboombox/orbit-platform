export const CUSTOMER_PURCHASE_ORDER_MAX_BYTES = 20 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);

export function validateCustomerPurchaseOrderFile(file: {
  name: string;
  size: number;
  type: string;
}) {
  if (!file.size) throw new Error("Adjunta la OC Cliente.");
  if (file.size > CUSTOMER_PURCHASE_ORDER_MAX_BYTES)
    throw new Error("Archivo demasiado grande. Máximo 20 MB.");
  const extension = file.name.split(".").at(-1)?.trim().toLowerCase() ?? "";
  if (!allowedMimeTypes.has(file.type.toLowerCase()) || !allowedExtensions.has(extension))
    throw new Error("Formato no permitido. Usa PDF, JPG o PNG.");
  return {
    extension: file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg",
    mimeType: file.type.toLowerCase(),
  };
}

export function customerPurchaseOrderDriveFileName(input: {
  documentId: string;
  orbitEventId: string;
  originalFilename: string;
}) {
  const safeName = input.originalFilename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "oc-cliente";
  return `OC_CLIENTE_${input.orbitEventId}_${input.documentId.slice(0, 8)}_${safeName}`;
}

export function operationalErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return fallback;
}

export type StoredAcceptedQuote = {
  quoteId: string;
  projectId: string;
  quotationNumber: string;
  versionId: string;
  version: number;
  storagePath: string;
};

export function originalQuotePdfHref(quoteId: string, version: number, download = false) {
  return `/api/commercial/quotes/${quoteId}/versions/${version}/pdf${download ? "?download=1" : ""}`;
}

export function resolveAcceptedStoredPdf(input: {
  quoteId: string;
  projectId: string;
  quotationNumber: string;
  acceptedVersionId: string | null;
  version?: { id: string; quoteId: string; number: number; status: string; acceptedAt: string | null; storagePath: string | null } | null;
}) {
  if (!input.acceptedVersionId) throw new Error("La cotización no tiene una versión aceptada.");
  const version = input.version;
  if (!version || version.id !== input.acceptedVersionId || version.quoteId !== input.quoteId || version.status !== "ACCEPTED" || !version.acceptedAt)
    throw new Error("La versión aceptada de la cotización no está disponible.");
  if (!version.storagePath) throw new Error("PDF original no disponible. Se requiere revisión administrativa.");
  return { quoteId: input.quoteId, projectId: input.projectId, quotationNumber: input.quotationNumber, versionId: version.id, version: version.number, storagePath: version.storagePath } satisfies StoredAcceptedQuote;
}

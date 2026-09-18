type ContractPdfCandidate = { storage_path?: string | null; mime_type?: string | null; original_filename?: string | null };

export function isPdfContractCandidate(candidate: ContractPdfCandidate) {
  const path = String(candidate.storage_path ?? "").toLowerCase();
  const mime = String(candidate.mime_type ?? "").toLowerCase();
  return mime === "application/pdf" || (!mime && path.endsWith(".pdf"));
}

export function resolveContractPdfPath(agreementPath: string | null | undefined, documents: ContractPdfCandidate[]) {
  const document = documents.find(isPdfContractCandidate);
  if (document?.storage_path) return document.storage_path;
  const path = String(agreementPath ?? "");
  return path.toLowerCase().endsWith(".pdf") ? path : null;
}

export function contractPdfFilename(eventName: string | null | undefined, eventId: string | null | undefined) {
  const label = String(eventName || eventId || "EVENTO").replace(/[^a-z0-9áéíóúñü -]/gi, "").trim().replace(/\s+/g, "_").slice(0, 90) || "EVENTO";
  return `CONTRATO_BOOMBOX_${label}.pdf`;
}

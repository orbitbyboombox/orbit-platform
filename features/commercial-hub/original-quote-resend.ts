import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAcceptedStoredPdf, type StoredAcceptedQuote } from "./original-quote-resend-model";

export async function loadStoredAcceptedQuote(
  projectId: string,
  quoteId: string,
): Promise<StoredAcceptedQuote> {
  const admin = createAdminClient();
  const { data: quote, error: quoteError } = await admin
    .from("quotations")
    .select("id,project_id,quotation_number,accepted_version_id")
    .eq("id", quoteId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (quoteError) throw quoteError;
  if (!quote) throw new Error("La cotización no está vinculada a este evento.");

  const { data: version, error: versionError } = await admin
    .from("quote_versions")
    .select("id,quote_id,version_number,status,accepted_at,pdf_storage_path")
    .eq("id", quote.accepted_version_id)
    .eq("quote_id", quote.id)
    .maybeSingle();
  if (versionError) throw versionError;
  const stored = resolveAcceptedStoredPdf({
    quoteId: quote.id,
    projectId: quote.project_id,
    quotationNumber: quote.quotation_number,
    acceptedVersionId: quote.accepted_version_id,
    version: version ? { id: version.id, quoteId: version.quote_id, number: Number(version.version_number), status: version.status, acceptedAt: version.accepted_at, storagePath: version.pdf_storage_path } : null,
  });

  const signed = await admin.storage
    .from("orbit-documents")
    .createSignedUrl(stored.storagePath, 60);
  if (signed.error)
    throw new Error("PDF original no disponible. Se requiere revisión administrativa.");

  return stored;
}

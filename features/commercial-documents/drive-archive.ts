import "server-only";

import { archiveReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import { quoteDisplayFilename } from "@/features/commercial-hub/presentation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function archiveAcceptedQuoteForProject(input: {
  quoteId: string;
  projectId: string;
}) {
  const admin = createAdminClient();
  const { data: quote, error: quoteError } = await admin
    .from("quotations")
    .select("quotation_number,pdf_storage_path,drive_file_id,accepted_version_id")
    .eq("id", input.quoteId)
    .single();
  if (quoteError) throw quoteError;
  if (quote.drive_file_id)
    return { archived: true, reused: true, driveFileId: quote.drive_file_id };
  const { data: acceptedVersion } = quote.accepted_version_id
    ? await admin.from("quote_versions").select("id,version_number,pdf_storage_path,drive_file_id").eq("id", quote.accepted_version_id).maybeSingle()
    : { data: null };
  const pdfStoragePath = acceptedVersion?.pdf_storage_path ?? quote.pdf_storage_path;
  if (!pdfStoragePath)
    return { archived: false, reason: "PDF_STORAGE_PENDING" as const };
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("event_date,customers!inner(full_name)")
    .eq("id", input.projectId)
    .single();
  if (projectError) throw projectError;
  const downloaded = await admin.storage
    .from("orbit-documents")
    .download(pdfStoragePath);
  if (downloaded.error) throw downloaded.error;
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const customer = Array.isArray(project.customers)
    ? project.customers[0]
    : project.customers;
  const drive = await archiveReservationDocumentToDrive({
    client: admin,
    projectId: input.projectId,
    customerName: customer.full_name,
    eventDate: project.event_date,
    kind: "QUOTATION",
    name: quoteDisplayFilename(quote.quotation_number).replace(/\.pdf$/i, `_V${acceptedVersion?.version_number ?? 1}.pdf`),
    mimeType: "application/pdf",
    bytes,
  });
  const { error: updateError } = await admin
    .from("quotations")
    .update({ drive_file_id: drive.id })
    .eq("id", input.quoteId)
    .is("drive_file_id", null);
  if (updateError) throw updateError;
  if (acceptedVersion?.id) {
    const { error: versionUpdateError } = await admin.from("quote_versions").update({ drive_file_id: drive.id }).eq("id", acceptedVersion.id).is("drive_file_id", null);
    if (versionUpdateError) throw versionUpdateError;
  }
  return { archived: true, reused: drive.reused, driveFileId: drive.id };
}

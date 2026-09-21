import { notFound } from "next/navigation";
import { loadCommercialQuoteDetail } from "@/features/commercial-hub/repository";
import { QuotePdfViewerPage } from "@/features/commercial-hub/quote-pdf-viewer-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CommercialQuotePdfPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const client = await createSupabaseServerClient();
  const quote = await loadCommercialQuoteDetail(client, quoteId);
  if (!quote) notFound();
  return <QuotePdfViewerPage quoteId={quote.id} quoteNumber={quote.number} />;
}

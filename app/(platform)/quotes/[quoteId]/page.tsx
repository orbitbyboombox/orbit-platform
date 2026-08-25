import { notFound } from "next/navigation";
import { CommercialQuoteDetailExperience } from "@/features/commercial-hub/quote-detail-experience";
import {
  loadCommercialHubData,
  loadCommercialQuoteDetail,
} from "@/features/commercial-hub/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CommercialQuotePage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const client = await createSupabaseServerClient();
  const quote = await loadCommercialQuoteDetail(client, quoteId);
  if (!quote) notFound();
  const hubData = quote.status === "DRAFT"
    ? await loadCommercialHubData(client)
    : undefined;
  return <CommercialQuoteDetailExperience hubData={hubData} quote={quote} />;
}

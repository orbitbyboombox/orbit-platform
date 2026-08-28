import {
  CollectionCenter,
  loadAccountsReceivable,
  type CollectionFilter,
} from "@/features/accounts-receivable";
import { resolveCollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";
import { loadCompanySettings } from "@/features/company-settings/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const filters = new Set<CollectionFilter>([
  "PENDING",
  "UPCOMING",
  "OVERDUE",
  "NO_NOTICE",
  "WEEK",
  "HISTORY",
]);

export default async function CollectionCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const client = await createSupabaseServerClient();
  const [dataset, company, params] = await Promise.all([
    loadAccountsReceivable(client),
    loadCompanySettings(client),
    searchParams,
  ]);
  const initialFilter = filters.has(params.filter as CollectionFilter)
    ? (params.filter as CollectionFilter)
    : "PENDING";

  return (
    <CollectionCenter
      bankDetails={resolveCollectionBankDetails(company)}
      dataset={dataset}
      initialFilter={initialFilter}
    />
  );
}

import { CollectionCenter, loadAccountsReceivable } from "@/features/accounts-receivable";
import { resolveCollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";
import { loadCompanySettings } from "@/features/company-settings/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CollectionCenterPage() {
  const client = await createSupabaseServerClient();
  const [dataset, company] = await Promise.all([
    loadAccountsReceivable(client),
    loadCompanySettings(client),
  ]);

  return (
    <CollectionCenter
      bankDetails={resolveCollectionBankDetails(company)}
      dataset={dataset}
    />
  );
}

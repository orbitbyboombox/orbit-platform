import {
  AccountsReceivableCenter,
  loadAccountsReceivable,
} from "@/features/accounts-receivable";
import { resolveCollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";
import { loadCompanySettings } from "@/features/company-settings/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AccountsReceivablePage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const client = await createSupabaseServerClient();
  const { invoice } = await searchParams;
  const [dataset, company] = await Promise.all([
    loadAccountsReceivable(client),
    loadCompanySettings(client),
  ]);

  return (
    <AccountsReceivableCenter
      bankDetails={resolveCollectionBankDetails(company)}
      dataset={dataset}
      initialInvoiceId={invoice}
    />
  );
}

import { FinanceIncomeCenter } from "@/features/finance/components/finance-income-center";
import { loadAccountsReceivable } from "@/features/accounts-receivable";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function FinanceIncomesPage() {
  const client = await createSupabaseServerClient();
  const dataset = await loadAccountsReceivable(client);
  return <FinanceIncomeCenter invoices={dataset.invoices} />;
}

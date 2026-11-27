import { FinanceIncomeCenter } from "@/features/finance/components/finance-income-center";
import { loadAccountsReceivable } from "@/features/accounts-receivable";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function FinanceIncomesPage({ searchParams }: { searchParams?: Promise<{ query?: string; status?: string; period?: string }> }) {
  const client = await createSupabaseServerClient();
  const dataset = await loadAccountsReceivable(client);
  const params = await searchParams;
  return <FinanceIncomeCenter invoices={dataset.invoices} initialQuery={params?.query} initialStatus={params?.status} initialPeriod={params?.period} />;
}

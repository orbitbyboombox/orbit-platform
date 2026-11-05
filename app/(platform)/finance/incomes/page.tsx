import { FinanceIncomeCenter } from "@/features/finance/components/finance-income-center";
import { loadCanonicalFinanceLedger } from "@/features/finance/canonical-ledger-read-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function FinanceIncomesPage() {
  const client = await createSupabaseServerClient();
  const ledger = await loadCanonicalFinanceLedger(client);
  return <FinanceIncomeCenter ledger={ledger} />;
}

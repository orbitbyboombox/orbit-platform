import { FinancePremiumCenter } from "@/features/finance/components/finance-premium-center";
import { loadFinanceDashboardReadModel } from "@/features/finance/finance-read-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function FinancePage() {
  const client = await createSupabaseServerClient();
  const data = await loadFinanceDashboardReadModel(client);

  return <FinancePremiumCenter month={data.month} position={data.position} />;
}

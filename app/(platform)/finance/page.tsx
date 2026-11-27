import { FinancePremiumCenter } from "@/features/finance/components/finance-premium-center";
import { loadFinanceDashboardReadModel } from "@/features/finance/finance-read-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function FinancePage({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const client = await createSupabaseServerClient();
  const params = await searchParams;
  const data = await loadFinanceDashboardReadModel(client, undefined, params?.period);

  return <FinancePremiumCenter month={data.month} position={data.position} forecast={data.forecast} risks={data.risks} cash={data.cash} period={data.period} periodLabel={data.periodLabel} />;
}

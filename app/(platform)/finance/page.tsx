import { ProfitEngine, ProfitabilityExperience, SupabaseProfitRepository } from "@/features/profit-engine";
import { SupplyEngine, SupabaseSupplyRepository } from "@/features/supply-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function FinancePage() {
  const client = await createSupabaseServerClient();
  const profitRepository = new SupabaseProfitRepository(client);
  const supplyRepository = new SupabaseSupplyRepository(client);
  const [events, supplies] = await Promise.all([profitRepository.findAll(), supplyRepository.findAll()]);
  const engine = new ProfitEngine(new SupplyEngine(supplies));
  const insights = engine.calculateInsights(events);
  const recommendation = engine.getRecommendation(insights);

  return <ProfitabilityExperience events={events} insights={insights} recommendation={recommendation} supplies={supplies} />;
}

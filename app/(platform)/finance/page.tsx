import { ProfitEngine, ProfitabilityExperience, SupabaseProfitRepository } from "@/features/profit-engine";
import { SupplyEngine, SupabaseSupplyRepository } from "@/features/supply-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowRight, ReceiptText } from "lucide-react";

export default async function FinancePage() {
  const client = await createSupabaseServerClient();
  const profitRepository = new SupabaseProfitRepository(client);
  const supplyRepository = new SupabaseSupplyRepository(client);
  const [events, supplies] = await Promise.all([profitRepository.findAll(), supplyRepository.findAll()]);
  const engine = new ProfitEngine(new SupplyEngine(supplies));
  const insights = engine.calculateInsights(events);
  const recommendation = engine.getRecommendation(insights);

  return <div className="space-y-5"><Link className="group flex items-center justify-between gap-4 rounded-2xl border border-brand/25 bg-brand/5 p-5 transition hover:border-brand/50" href="/finance/receivables"><div className="flex items-center gap-4"><span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand"><ReceiptText className="size-5"/></span><div><p className="font-semibold">Cuentas por Cobrar</p><p className="mt-1 text-sm text-muted">Facturas, vencimientos, pagos y antigüedad de saldos.</p></div></div><ArrowRight className="size-5 text-muted transition group-hover:translate-x-1 group-hover:text-brand"/></Link><ProfitabilityExperience events={events} insights={insights} recommendation={recommendation} supplies={supplies} /></div>;
}

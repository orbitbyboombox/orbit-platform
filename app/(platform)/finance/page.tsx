import {
  AvailableCashSection,
  FinancialDashboardHeader,
  FinancialRisksSection,
  PeriodMetricsSection,
} from "@/features/finance/components/financial-dashboard";
import { loadFinanceDashboardReadModel } from "@/features/finance/finance-read-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Landmark, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function FinancePage() {
  const client = await createSupabaseServerClient();
  const data = await loadFinanceDashboardReadModel(client);

  return <div className="space-y-7">
    <FinancialDashboardHeader data={data} />
    <div className="flex flex-wrap justify-end gap-3">
      <Button asChild variant="outline"><Link href="/finance/collections"><Mail className="size-4"/>Cobrar a Clientes</Link></Button>
      <Button asChild variant="outline"><Link href="/finance/banking"><Landmark className="size-4"/>Bancos y conciliación</Link></Button>
    </div>
    <PeriodMetricsSection eyebrow="Desempeño mensual" title={`Este mes · ${data.periodLabel}`} description="Ventas, cobros y resultado del período, con costos directos y overhead separados." metrics={data.month} workspaceKey="FINANCE_MONTH" />
    <PeriodMetricsSection eyebrow="Posición financiera" title="Posición actual" description="Saldos acumulados y exposición vigente; no se mezclan con el desempeño mensual." metrics={data.position} workspaceKey="FINANCE_POSITION" />
    <AvailableCashSection data={data.cash} />
    <PeriodMetricsSection eyebrow="Actividad diaria" title="Hoy" description="Actividad financiera registrada durante la jornada." metrics={data.today} workspaceKey="FINANCE_TODAY" />
    <PeriodMetricsSection eyebrow="Proyección separada" title="Próximos 30 días" description="Compromisos y cobranzas activas dentro del horizonte; no son dinero realizado." metrics={data.forecast} workspaceKey="FINANCE_FORECAST" />
    <FinancialRisksSection data={data.risks} />
  </div>;
}

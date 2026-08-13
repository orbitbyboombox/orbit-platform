import {
  AvailableCashSection,
  FinancialDashboardHeader,
  FinancialRisksSection,
  PeriodMetricsSection,
} from "@/features/finance/components/financial-dashboard";
import { loadFinanceDashboardReadModel } from "@/features/finance/finance-read-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function FinancePage() {
  const client = await createSupabaseServerClient();
  const data = await loadFinanceDashboardReadModel(client);

  return <div className="space-y-7">
    <FinancialDashboardHeader data={data} />
    <AvailableCashSection data={data.cash} />
    <PeriodMetricsSection eyebrow="Sección 02" title="Hoy" description="Actividad financiera registrada durante la jornada." metrics={data.today} workspaceKey="FINANCE_TODAY" />
    <PeriodMetricsSection eyebrow="Sección 03" title={`Este mes · ${data.periodLabel}`} description="Resultado consolidado del período en curso." metrics={data.month} workspaceKey="FINANCE_MONTH" />
    <PeriodMetricsSection eyebrow="Sección 04" title="Próximos 30 días" description="Compromisos y cobranzas activas dentro del horizonte." metrics={data.forecast} workspaceKey="FINANCE_FORECAST" />
    <FinancialRisksSection data={data.risks} />
  </div>;
}

import {
  Boxes,
  CircleDollarSign,
  Fuel,
  PackageCheck,
  Percent,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { SectionTitle } from "@/components/layout/section-title";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataStateBadge } from "@/components/ui/data-state-badge";
import { SupplyEngine, type SupplyDefinition, type SupplyStatus, type SupplyUnit } from "@/features/supply-engine";
import type { EventProfitSummary, ProfitInsights, ProfitRecommendation } from "../types/profit.types";

const currency = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const decimalCurrency = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 2 });

const SUPPLY_STATUS: Record<SupplyStatus, { label: string; variant: "success" | "warning" | "neutral" }> = {
  ACTIVE: { label: "Activo", variant: "success" },
  LOW_STOCK: { label: "Stock bajo", variant: "warning" },
  INACTIVE: { label: "Inactivo", variant: "neutral" },
};

const UNIT_LABEL: Record<SupplyUnit, string> = {
  PHOTO: "fotografía",
  EVENT: "evento",
  MONTH: "mes",
};

interface ProfitabilityExperienceProps {
  events: readonly EventProfitSummary[];
  insights: ProfitInsights;
  recommendation: ProfitRecommendation;
  supplies: readonly SupplyDefinition[];
  fuelPricePerLiter?: number;
}

export function ProfitabilityExperience({ events, insights, recommendation, supplies, fuelPricePerLiter }: ProfitabilityExperienceProps) {
  const supplyEngine = new SupplyEngine(supplies);
  const totalRevenue = events.reduce((sum, event) => sum + event.revenue, 0);
  const totalOperationalCost = events.reduce((sum, event) => sum + event.operationalCost, 0);
  const totalMargin = totalRevenue - totalOperationalCost;
  const totalMarginPercentage = totalRevenue === 0 ? 0 : (totalMargin / totalRevenue) * 100;

  return (
    <div className="space-y-10 lg:space-y-12">
      <header className="rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div className="flex flex-wrap items-center gap-3"><p className="text-sm font-medium text-brand">NEGOCIO · RENTABILIDAD</p><DataStateBadge state="ESTIMATED" label="Estimado · datos productivos" /></div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Rentabilidad Operacional</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">Estimación del resultado operacional de cada evento, alimentada por el Motor de Insumos.</p>
      </header>

      <section aria-label="Resumen de rentabilidad" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SmartCard icon={<CircleDollarSign aria-hidden="true" className="size-5" />} primaryValue={currency.format(totalRevenue)} secondaryValue="Datos productivos · no contables" status={<DataStateBadge state="ESTIMATED" />} title="Ingresos estimados" />
        <SmartCard icon={<Boxes aria-hidden="true" className="size-5" />} primaryValue={currency.format(totalOperationalCost)} secondaryValue="Estimación de equipo, transporte, combustible e insumos" status={<DataStateBadge state="ESTIMATED" />} title="Costo operacional estimado" />
        <SmartCard icon={<TrendingUp aria-hidden="true" className="size-5" />} primaryValue={currency.format(totalMargin)} secondaryValue="Estimado, no contable" status={<StatusBadge label="Positivo" variant="success" />} title="Margen bruto estimado" />
        <SmartCard icon={<Percent aria-hidden="true" className="size-5" />} primaryValue={`${totalMarginPercentage.toFixed(1)}%`} secondaryValue="Sobre los eventos registrados" status={<DataStateBadge state="ESTIMATED" />} title="Margen bruto estimado" />
      </section>

      <SmartCard
        className="border-brand/25"
        icon={<Sparkles aria-hidden="true" className="size-5 text-brand" />}
        primaryValue={recommendation.title}
        secondaryValue={recommendation.reason}
        status={<StatusBadge label="Una recomendación" variant="info" />}
        title="ORBIT NOVA"
      />

      <section aria-labelledby="event-profitability" className="space-y-5">
        <div id="event-profitability"><SectionTitle description="Ingresos y costos estimados para cada evento registrado." title="Rentabilidad por evento" /></div>
        <div className="grid gap-4 xl:grid-cols-3">
          {events.map((event) => (
            <SmartCard
              icon={<TrendingUp aria-hidden="true" className="size-5" />}
              key={event.eventId}
              primaryValue={currency.format(event.estimatedGrossMargin)}
              secondaryValue={`Margen estimado · ${event.grossMarginPercentage.toFixed(1)}%`}
              status={<StatusBadge label={event.service} variant="success" />}
              title={event.eventName}
            >
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-muted">Ingresos</dt><dd className="mt-1 font-semibold">{currency.format(event.revenue)}</dd></div>
                <div><dt className="text-muted">Costo operacional</dt><dd className="mt-1 font-semibold">{currency.format(event.operationalCost)}</dd></div>
                <div><dt className="text-muted">Equipo</dt><dd className="mt-1 font-medium">{currency.format(event.staffCost)}</dd></div>
                <div><dt className="text-muted">Costo real transporte</dt><dd className="mt-1 font-medium">{currency.format(event.transportCost)}</dd></div>
                <div><dt className="text-muted">Combustible estimado</dt><dd className="mt-1 font-medium">{currency.format(event.fuelCost)}</dd></div>
                <div><dt className="text-muted">Insumos</dt><dd className="mt-1 font-medium">{currency.format(event.suppliesCost)}</dd></div>
              </dl>
            </SmartCard>
          ))}
          {events.length === 0 && <SmartCard icon={<TrendingUp aria-hidden="true" className="size-5" />} primaryValue="Aún no hay eventos calculados" secondaryValue="Cuando registres ingresos y costos de un evento, verás aquí su rentabilidad estimada." title="Comienza con tu primer evento" />}
        </div>
      </section>

      <section aria-labelledby="supply-engine" className="space-y-5">
        <div id="supply-engine"><SectionTitle description="Fuente única de costos unitarios utilizados por el Motor de Rentabilidad." title="Motor de Insumos" /></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {supplies.map((supply) => {
            const cost = supplyEngine.getSupplyCost(supply.id);
            const status = SUPPLY_STATUS[supply.status];
            return (
              <SmartCard
                icon={<PackageCheck aria-hidden="true" className="size-5" />}
                key={supply.id}
                primaryValue={`${decimalCurrency.format(cost.costPerUnit)} / ${UNIT_LABEL[cost.unit]}`}
                secondaryValue={`Compra · ${currency.format(supply.purchasePrice)}${supply.vatIncluded ? " IVA incluido" : ""}`}
                status={<StatusBadge label={status.label} variant={status.variant} />}
                title={supply.name}
              >
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-muted">Proveedor</dt><dd className="mt-1 font-medium">{supply.supplier}</dd></div>
                  <div><dt className="text-muted">Vida útil</dt><dd className="mt-1 font-medium">{supply.usefulLife}</dd></div>
                  <div><dt className="text-muted">Método</dt><dd className="mt-1 font-medium">{supply.calculationMethod === "PRODUCTION_OUTPUT" ? "Producción" : supply.calculationMethod === "EVENT_CAPACITY" ? "Capacidad por eventos" : supply.calculationMethod === "DIRECT_EVENT_COST" ? "Costo directo" : "Amortización mensual"}</dd></div>
                  <div><dt className="text-muted">Actualizado</dt><dd className="mt-1 font-medium">{supply.lastUpdated}</dd></div>
                </dl>
                {supply.contents && <p className="mt-4 border-t pt-4 text-sm text-muted">{supply.contents.join(" · ")}</p>}
              </SmartCard>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="business-insights" className="space-y-5">
        <div id="business-insights"><SectionTitle description="Lectura comparativa de los eventos incluidos en esta estimación." title="Inteligencia del negocio" /></div>
        <div className="grid gap-4 lg:grid-cols-3">
          {insights.services.map((service) => (
            <SmartCard icon={<TrendingUp aria-hidden="true" className="size-5" />} key={service.service} primaryValue={`${service.averageMarginPercentage.toFixed(1)}%`} secondaryValue={`${currency.format(service.averageMargin)} de margen promedio`} title={`${service.service} · Margen promedio`} />
          ))}
          <SmartCard icon={<CircleDollarSign aria-hidden="true" className="size-5" />} primaryValue={currency.format(insights.averageOperationalCost)} secondaryValue="Promedio por evento" title="Costo operacional promedio" />
          <SmartCard icon={<Fuel aria-hidden="true" className="size-5" />} primaryValue={fuelPricePerLiter === undefined ? "Precio pendiente" : currency.format(fuelPricePerLiter)} secondaryValue="Gasolina 93 · ingresa un valor para completar la estimación" status={<DataStateBadge state="ESTIMATED" />} title="Precio estimado de combustible" />
        </div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  FileText,
  ReceiptText,
  TrendingUp,
  WalletCards,
  UsersRound,
} from "lucide-react";

type Metric = {
  label: string;
  value: number;
  format: "money" | "percent" | "count";
  detail: string;
  href: string;
};

type SectionKey = "sii" | "ventas" | "gastos" | "clientes";

type Access = { label: string; href: string; description: string };

const sections: Array<{
  key: SectionKey;
  title: string;
  description: string;
  icon: typeof FileText;
  accesses: Access[];
}> = [
  {
    key: "sii",
    title: "SII",
    description: "Gestión tributaria",
    icon: FileText,
    accesses: [
      { label: "Facturación electrónica", href: "/finance/tributary/facturas", description: "DTE 33 · Facturas electrónicas" },
      { label: "Boletas electrónicas", href: "/finance/tributary/boletas", description: "DTE 39 · Emisión preparada" },
      { label: "Guías de despacho", href: "/finance/tributary/guias", description: "DTE 52 · Operaciones y traslados" },
      { label: "Notas de crédito y débito", href: "/finance/tributary/notas-credito", description: "DTE 61 · Notas de crédito · DTE 56 en su módulo" },
      { label: "Registro de compras y ventas", href: "/finance/tributary/compras", description: "Registro de compras y control" },
      { label: "Archivo tributario", href: "/finance/tributary/archivo", description: "Historial y documentos" },
      { label: "Configuración SII", href: "/settings#tributary", description: "Certificados y CAF · emisión bloqueada" },
    ],
  },
  {
    key: "ventas",
    title: "VENTAS",
    description: "Ingresos y cobranzas",
    icon: TrendingUp,
    accesses: [
      { label: "Ventas por evento", href: "/finance/incomes", description: "Ingresos vinculados a Event 360°" },
      { label: "Cotizaciones aceptadas", href: "/projects?status=ACCEPTED", description: "Oportunidades confirmadas" },
      { label: "Cuentas por cobrar", href: "/finance/receivables", description: "Saldos e historial de vencimientos" },
      { label: "Pagos recibidos", href: "/finance/receivables?status=paid", description: "Payment Ledger canónico" },
      { label: "Cobranza consolidada", href: "/finance/collections", description: "Gestión por cliente" },
      { label: "Rentabilidad", href: "/projects?view=profitability", description: "Resultado por evento" },
    ],
  },
  {
    key: "gastos",
    title: "GASTOS",
    description: "Costos y egresos",
    icon: WalletCards,
    accesses: [
      { label: "Gastos operacionales", href: "/finance/expenses", description: "Egresos con respaldo" },
      { label: "Finanzas Staff", href: "/finance/staff", description: "Honorarios y liquidaciones" },
      { label: "Honorarios y remuneraciones", href: "/resources/staff?workspace=payroll", description: "Cierre y pagos de equipo" },
      { label: "Proveedores", href: "/finance/payables", description: "Cuentas por pagar" },
      { label: "Reembolsos", href: "/finance/expenses?filter=reimbursements", description: "Gastos reembolsables" },
      { label: "Costos por evento", href: "/projects?view=profitability", description: "Papel, staff, traslados y operación" },
    ],
  },
  {
    key: "clientes",
    title: "CLIENTES",
    description: "Gestión financiera comercial",
    icon: UsersRound,
    accesses: [
      { label: "Cartera de clientes", href: "/customers", description: "Clientes activos y empresas" },
      { label: "Ficha financiera individual", href: "/customers", description: "Saldos, documentos y eventos" },
      { label: "Historial de eventos", href: "/projects", description: "Event 360° asociado al cliente" },
      { label: "Documentos tributarios", href: "/finance/tributary", description: "DTE y archivo tributario" },
      { label: "Saldos pendientes", href: "/finance/receivables", description: "Cuentas por cobrar" },
      { label: "Historial de pagos", href: "/finance/receivables?status=paid", description: "Pagos confirmados" },
    ],
  },
];

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function formatMetric(metric?: Metric) {
  if (!metric) return "—";
  if (metric.format === "money") return money.format(metric.value);
  if (metric.format === "percent") return `${metric.value.toFixed(1)}%`;
  return new Intl.NumberFormat("es-CL").format(metric.value);
}

export function FinancePremiumCenter({ month, position }: { month: Metric[]; position: Metric[] }) {
  const [selected, setSelected] = useState<SectionKey | null>(null);
  const active = useMemo(() => sections.find((section) => section.key === selected), [selected]);
  const metric = (label: string) => month.find((item) => item.label === label) ?? position.find((item) => item.label === label);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.24em]" style={{ color: "#F58B22" }}>ORBIT · v2.1.8</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Finanzas</h1>
        <p className="mt-2 text-base" style={{ color: "#9AA1AC" }}>Centro de administración financiera</p>
      </header>

      <section aria-label="Módulos principales de Finanzas" className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          const isSelected = selected === section.key;
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setSelected(isSelected ? null : section.key)}
              aria-expanded={isSelected}
              className="group rounded-3xl border p-6 text-left transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: isSelected ? "#302218" : "#171A20",
                borderColor: isSelected ? "#F58B22" : "#30343B",
                boxShadow: isSelected ? "0 0 0 1px rgba(245,139,34,.25)" : "none",
              }}
            >
              <div className="flex items-start justify-between gap-5">
                <span className="flex size-11 items-center justify-center rounded-2xl" style={{ color: "#F58B22", background: "rgba(245,139,34,.12)" }}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <ChevronRight className={`size-5 transition-transform ${isSelected ? "rotate-90" : "group-hover:translate-x-0.5"}`} style={{ color: "#F58B22" }} aria-hidden />
              </div>
              <h2 className="mt-7 text-2xl font-semibold text-white">{section.title}</h2>
              <p className="mt-1 text-sm" style={{ color: "#9AA1AC" }}>{section.description}</p>
            </button>
          );
        })}
      </section>

      {active && (
        <section aria-label={`Accesos de ${active.title}`} className="rounded-3xl border p-5 sm:p-7" style={{ background: "#171A20", borderColor: "#30343B" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em]" style={{ color: "#F58B22" }}>Accesos internos</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{active.title} · {active.description}</h2>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="text-sm hover:underline" style={{ color: "#9AA1AC" }}>Cerrar</button>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {active.accesses.map((access) => (
              <Link key={access.label} href={access.href} className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 transition hover:border-[#F58B22]" style={{ borderColor: "#30343B", background: "#0C0E12" }}>
                <span><strong className="block text-sm text-white">{access.label}</strong><small style={{ color: "#9AA1AC" }}>{access.description}</small></span>
                <ChevronRight className="size-4 shrink-0" style={{ color: "#F58B22" }} aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}

      {!selected && (
        <section aria-label="Resumen financiero ejecutivo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Ingresos del mes", item: metric("Ventas del mes"), Icon: ReceiptText },
            { label: "Gastos del mes", item: metric("Egresos pagados del mes"), Icon: WalletCards },
            { label: "Por cobrar", item: metric("Por cobrar total"), Icon: FileText },
            { label: "Rentabilidad", item: metric("Margen operativo") ?? metric("Margen de Eventos"), Icon: TrendingUp },
          ].map(({ label, item, Icon }) => {
            const typed = item;
            const ChartIcon = Icon;
            return <Link key={label} href={typed?.href ?? "/finance"} className="rounded-2xl border p-5 transition hover:border-[#F58B22]" style={{ background: "#171A20", borderColor: "#30343B" }}>
              <div className="flex items-center justify-between"><span className="text-sm" style={{ color: "#9AA1AC" }}>{label}</span><ChartIcon className="size-4" style={{ color: "#F58B22" }} aria-hidden /></div>
              <p className="mt-4 text-2xl font-semibold text-white">{formatMetric(typed)}</p>
              <p className="mt-2 text-xs" style={{ color: "#9AA1AC" }}>{typed?.detail ?? "Sin datos disponibles"}</p>
            </Link>;
          })}
        </section>
      )}

      <div className="flex items-center gap-2 text-xs" style={{ color: "#9AA1AC" }}>
        <span className="size-1.5 rounded-full" style={{ background: "#F58B22" }} />
        Emisión tributaria real bloqueada · SII pendiente de certificación oficial
      </div>
    </div>
  );
}

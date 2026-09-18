import Link from "next/link";
import { FileDown, Landmark, ReceiptText, WalletCards } from "lucide-react";

const reports = [
  ["Exportación contable", "Resumen para contador y revisión mensual.", "/finance/accountant-export", FileDown],
  ["Cuentas por cobrar", "Facturas, vencimientos y pagos recibidos.", "/finance/receivables", ReceiptText],
  ["Cuentas por pagar", "Compromisos operacionales y próximos pagos.", "/finance/payables", WalletCards],
  ["Caja y conciliación", "Movimientos registrados y cuentas bancarias.", "/finance/cash-flow", Landmark],
] as const;
export default function FinanceReportsPage() { return <main className="space-y-6" aria-label="Reportes financieros"><header className="rounded-3xl border bg-card p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Finanzas · Reportes</p><h1 className="mt-2 text-3xl font-semibold">Reportes y exportaciones</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Accesos a las vistas y exportaciones canónicas de Finanzas. Cada reporte abre su fuente de origen.</p></header><section className="grid gap-3 sm:grid-cols-2">{reports.map(([title, detail, href, Icon]) => <Link className="flex items-start justify-between gap-4 rounded-2xl border bg-card p-5 hover:border-brand/60" href={href} key={href}><span><Icon className="size-5 text-brand"/><strong className="mt-3 block">{title}</strong><span className="mt-1 block text-sm text-muted">{detail}</span></span><span className="text-brand">→</span></Link>)}</section></main>; }

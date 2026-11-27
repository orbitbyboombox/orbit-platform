"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const tabs = [
  ["/finance", "Resumen"],
  ["/finance/incomes", "Ingresos"],
  ["/finance/expenses", "Gastos"],
  ["/finance/receivables", "Por cobrar"],
  ["/finance/payables", "Por pagar"],
  ["/finance/staff", "Staff"],
  ["/finance/cash-flow", "Caja"],
  ["/finance/taxes", "Impuestos"],
  ["/finance/reports", "Reportes"],
] as const;

export function FinanceTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = searchParams.get("period");
  const withPeriod = (href: string) => {
    if (!period) return href;
    return `${href}${href.includes("?") ? "&" : "?"}period=${encodeURIComponent(period)}`;
  };
  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 md:hidden" aria-label="Navegación rápida">
        <button type="button" onClick={() => router.back()} className="inline-flex min-h-11 shrink-0 items-center rounded-xl border px-3 py-2 text-xs font-semibold text-muted transition hover:border-brand hover:text-foreground" aria-label="Volver a la página anterior">← Volver</button>
        {pathname !== "/finance" && <Link href={withPeriod("/finance")} className="inline-flex min-h-11 shrink-0 items-center rounded-xl border px-3 py-2 text-xs font-semibold text-muted transition hover:border-brand hover:text-foreground">← Finanzas</Link>}
        <Link href="/operations" className="inline-flex min-h-11 shrink-0 items-center rounded-xl border px-3 py-2 text-xs font-semibold text-muted transition hover:border-brand hover:text-foreground">Inicio</Link>
      </div>
      <nav aria-label="Secciones de Finanzas" className="min-w-0 max-w-full overflow-x-auto pb-1 overscroll-x-contain">
      <div className="flex min-w-max gap-1 rounded-2xl border border-[var(--shell-divider,var(--border))] bg-[var(--shell-surface,var(--card))] p-1">
        {tabs.map(([href, label]) => {
          const active = href === "/finance" ? pathname === href : pathname.startsWith(href);
          return <Link aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-4 ${active ? "bg-[var(--shell-brand,var(--brand))] text-brand-foreground shadow-sm" : "text-muted hover:bg-background hover:text-foreground"}`} href={withPeriod(href)} key={href}>{label}</Link>;
        })}
      </div>
      </nav>
    </>
  );
}

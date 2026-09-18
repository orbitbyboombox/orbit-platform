"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  ["/finance", "Resumen"],
  ["/finance/incomes", "Ingresos"],
  ["/finance/expenses", "Gastos"],
  ["/finance/receivables", "Por cobrar"],
  ["/finance/payables", "Por pagar"],
  ["/finance/cash-flow", "Caja"],
  ["/finance/taxes", "Impuestos"],
  ["/finance/reports", "Reportes"],
] as const;

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de Finanzas" className="-mx-1 overflow-x-auto pb-1">
      <div className="flex min-w-max gap-1 rounded-2xl border bg-card/70 p-1">
        {tabs.map(([href, label]) => {
          const active = href === "/finance" ? pathname === href : pathname.startsWith(href);
          return <Link aria-current={active ? "page" : undefined} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active ? "bg-brand text-brand-foreground shadow-sm" : "text-muted hover:bg-background hover:text-foreground"}`} href={href} key={href}>{label}</Link>;
        })}
      </div>
    </nav>
  );
}

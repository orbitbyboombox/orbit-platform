"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 md:hidden" aria-label="Navegación rápida">
        <button type="button" onClick={() => router.back()} className="shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold text-muted transition hover:border-brand hover:text-foreground" aria-label="Volver a la página anterior">← Volver</button>
        {pathname !== "/finance" && <Link href="/finance" className="shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold text-muted transition hover:border-brand hover:text-foreground">← Finanzas</Link>}
        <Link href="/operations" className="shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold text-muted transition hover:border-brand hover:text-foreground">Inicio</Link>
      </div>
      <nav aria-label="Secciones de Finanzas" className="-mx-1 max-w-full overflow-x-auto pb-1 overscroll-x-contain">
      <div className="flex min-w-max gap-1 rounded-2xl border bg-card/70 p-1">
        {tabs.map(([href, label]) => {
          const active = href === "/finance" ? pathname === href : pathname.startsWith(href);
          return <Link aria-current={active ? "page" : undefined} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active ? "bg-brand text-brand-foreground shadow-sm" : "text-muted hover:bg-background hover:text-foreground"}`} href={href} key={href}>{label}</Link>;
        })}
      </div>
      </nav>
    </>
  );
}

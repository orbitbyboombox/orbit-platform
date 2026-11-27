import Link from "next/link";
import { ReceivedFeePdf } from "@/features/finance/components/received-fee-pdf";
import { SiiReceivedFeeForm } from "@/features/finance/components/sii-received-fee-form";
import { loadReceivedFees, receivedFeeReview } from "@/features/finance/sii-received-fees";
import { notFound } from "next/navigation";
import { SiiRcvPreview } from "@/features/finance/components/sii-rcv-preview";
import { loadRcvReport, loadStaffPeriodAmounts, siiCompanyRut, summarizeRcvAmounts, periodBounds } from "@/features/finance/sii-rcv-report";
import { recordRcvPeriodEvent } from "@/features/finance/sii-rcv-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ period?: string; year?: string; month?: string; libro?: string; module?: string }> }) {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) notFound();
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) notFound();

  const selected = await searchParams;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).format(new Date());
  const input = selected.year && /^[1-9]\d{3}$/.test(selected.year)
    ? selected.year + (selected.month && /^(0[1-9]|1[0-2])$/.test(selected.month) ? "-" + selected.month : "")
    : selected.period ?? today;
  const period = /^[1-9]\d{3}(?:-(?:0[1-9]|1[0-2]))?$/.test(input) ? input : today;
  const activeModule = selected.libro === "compras" || selected.libro === "ventas" ? selected.libro : ["honorarios", "importar", "cierre", "historial"].includes(selected.activeModule ?? "") ? selected.module : "home";
  const showRcv = activeModule === "home" || activeModule === "compras" || activeModule === "ventas";
  const bounds = periodBounds(period);
  const [rows, periodEvents, staffAmounts, fees, imports] = await Promise.all([
    showRcv ? loadRcvReport(period).catch(() => null) : Promise.resolve([]),

    period.length === 7 ? createAdminClient().from("sii_rcv_period_events" as never).select("action").eq("company_rut", siiCompanyRut)
      .eq("period", `${period}-01`).order("id", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    activeModule === "home" || activeModule === "honorarios" ? loadStaffPeriodAmounts(period).catch(() => null) : Promise.resolve(null),
    activeModule === "honorarios" ? loadReceivedFees(period).catch(() => null) : Promise.resolve([]),
    activeModule === "historial" ? createAdminClient().from("sii_rcv_imports" as never).select("id,register,period,source_name,imported_at").eq("company_rut", siiCompanyRut).gte("period",bounds.start).lt("period",bounds.end).order("imported_at",{ascending:false}).limit(100) : Promise.resolve({data:[],error:null}),
  ]);
  const importRows = (imports.data ?? []) as {id:string;register:string;period:string;source_name:string;imported_at:string}[];
  const saved = {
    Compras: (rows ?? []).filter(row => row.register === "Compras").map(row => ({ ...row.snapshot, expenseCategory: row.expense_category, evidence: row.evidence })),
    Ventas: (rows ?? []).filter(row => row.register === "Ventas").map(row => ({ ...row.snapshot, evidence: row.evidence })),
  };
  const events = (periodEvents.data ?? []) as { action: string }[];
  const closed = events.find(event => ["CLOSED", "REOPENED"].includes(event.action))?.action === "CLOSED";
  const ownerZero = events.some(event => event.action === "OWNER_ZERO_FEES");
  const canClose = period.length === 7 && period < new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit",
  }).format(new Date());
  const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" });
  const fieldNames = { net: "Neto", exempt: "Exento", vat: "IVA informado", nonRecoverableVat: "IVA no recuperable", total: "Total" };
  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <Link href={activeModule === "home" ? `/finance/tributary?period=${period.slice(0,7)}` : `?period=${period}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">← {activeModule === "home" ? "Volver al Centro tributario" : "Volver a Contabilidad"}</Link>
      <header className="rounded-3xl border bg-card p-5 sm:p-7"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Finanzas SII · ORBIT</p><h1 className="mt-2 text-3xl font-semibold">Contabilidad Premium</h1><p className="mt-2 text-sm text-muted">Registros oficiales del SII, revisión y respaldos por período. Sin movimientos contables automáticos.</p></header>
      <form className="grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-3" method="get">
        {selected.libro && <input type="hidden" name="libro" value={selected.libro} />}{selected.module && <input type="hidden" name="module" value={selected.activeModule} />}
        <label className="text-sm">Año
          <input name="year" defaultValue={period.slice(0,4)} pattern="[1-9][0-9]{3}" inputMode="numeric" required className="mt-1 block w-full rounded-lg border bg-background p-2" />
        </label>
        <label className="text-sm">Mes
          <select name="month" defaultValue={period.slice(5)} className="mt-1 block w-full rounded-lg border bg-background p-2">
            <option value="">Todo el año</option>
            {Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2,"0")}>
              {new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026,index,1)))}
            </option>)}
          </select>
        </label>
        <button className="min-h-11 rounded-lg border px-4 text-sm">Consultar período</button>
      </form>
      <nav aria-label="Contabilidad" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[
          {id:"compras",label:"Libro de Compras",href:`?period=${period}&libro=compras`},
          {id:"ventas",label:"Libro de Ventas",href:`?period=${period}&libro=ventas`},
          {id:"honorarios",label:"Honorarios",href:`?period=${period}&module=honorarios`},
          {id:"importar",label:"Importar / actualizar CSV",href:`?period=${period}&module=importar`},
          {id:"historial",label:"Historial de importaciones",href:`?period=${period}&module=historial`},
          {id:"cierre",label:"Cierre contable",href:`?period=${period}&module=cierre`},
        ].map(item => <Link key={item.id} href={item.href} aria-current={activeModule===item.id?"page":undefined} className={`flex min-h-14 items-center rounded-xl border bg-card p-3 text-sm font-semibold transition hover:border-brand/60 ${activeModule===item.id?"border-brand text-brand":"text-muted"}`}>{item.label}</Link>)}
      </nav>
      {activeModule === "home" && rows === null && <p role="alert">No se pudo cargar el resumen tributario.</p>}
      {period.length === 7 && !periodEvents.error && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-sm"><span>{closed ? "Período cerrado" : "Período abierto para revisión"}</span>{ownerZero && <span className="text-xs text-muted">0 boletas informadas · pendiente de conciliación oficial</span>}</div>}
      {activeModule === "home" && rows && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[[ "Compras", saved.Compras.length ], [ "Ventas", saved.Ventas.length ], [ "Diferencias por revisar", rows.filter(row => row.has_difference).length ]].map(([label, value]) =>
          <div key={label} className="rounded-xl border bg-card p-3"><p className="text-sm text-muted">{label}</p><strong className="text-xl">{value}</strong></div>
        )}
      </div>}
      {activeModule === "home" && rows && <section className="grid min-w-0 gap-3 lg:grid-cols-2" aria-label="Importes del Registro de Compras y Ventas">
        {summarizeRcvAmounts(rows).map(({ register, totals, adjustments }) => <div key={register} className="min-w-0 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{register} · importes informados por el SII</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            {totals.map(({ field, amount, missing }) => <div key={field}>
              <dt className="text-sm text-muted">{fieldNames[field]}</dt>
              <dd className="break-words font-semibold">{amount === null ? "Sin informar" : clp.format(amount)}</dd>
              {missing > 0 && <dd className="text-xs text-muted">{missing} sin importe</dd>}
            </div>)}
          </dl>
          {adjustments > 0 && <p className="mt-2 text-sm text-muted">{adjustments} notas de crédito o débito por revisar, fuera de estos subtotales.</p>}
        </div>)}
      </section>}
      {(activeModule === "home" || activeModule === "honorarios") && <section className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Flujo de caja · pagos Staff registrados</h2>
        {staffAmounts ? <dl className="mt-3 grid grid-cols-2 gap-3">
          <div><dt className="text-sm text-muted">Pagado</dt><dd>{clp.format(staffAmounts.paid)}</dd></div>
          <div><dt className="text-sm text-muted">Retenciones registradas</dt><dd>{staffAmounts.withheld === null ? "Sin informar" : clp.format(staffAmounts.withheld)}</dd></div>
          {staffAmounts.missing > 0 && <div className="col-span-2 text-sm text-muted">{staffAmounts.missing} pagos sin retención informada.</div>}
        </dl> : <p role="alert">No se pudieron cargar los pagos Staff.</p>}
      </section>}
      {activeModule === "cierre" && period.length === 7 && !periodEvents.error && <section className="space-y-3 rounded-xl border p-3">
        <p className="font-semibold">Período {closed ? "cerrado para importaciones" : "abierto para revisión"}</p>
        {ownerZero && <p className="text-sm">0 boletas de honorarios informadas por el propietario · pendiente de conciliación oficial.</p>}
        <form action={recordRcvPeriodEvent} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value={period} />
          <label className="text-sm">Motivo
            <input name="reason" required maxLength={500} className="mt-1 block w-full rounded-lg border bg-background p-2" />
          </label>
          {(closed || canClose) && <button name="action" value={closed ? "REOPENED" : "CLOSED"} className="min-h-10 rounded-lg border px-3 text-sm">
            {closed ? "Reabrir período" : "Cerrar período"}
          </button>}
          {!closed && !ownerZero && <button name="action" value="OWNER_ZERO_FEES" className="min-h-10 rounded-lg border px-3 text-sm">Registrar 0 boletas informadas</button>}
        </form>
      </section>}
      {activeModule === "historial" && <section className="rounded-2xl border bg-card p-4 sm:p-6"><h2 className="text-xl font-semibold">Historial de importaciones</h2><p className="mt-2 text-sm text-muted">Últimos 100 archivos originales guardados del período seleccionado.</p>{imports.error ? <p role="alert" className="mt-4 text-sm">No se pudo consultar el historial.</p> : importRows.length ? <ul className="mt-4 divide-y">{importRows.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-semibold">{item.register} · {item.period.slice(0,7)}</p><p className="break-all text-xs text-muted">{item.source_name}</p><p className="text-xs text-muted">{new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"short",timeZone:"America/Santiago"}).format(new Date(item.imported_at))}</p></div><Link href={`?period=${item.period.slice(0,7)}&libro=${item.register.toLowerCase()}`} className="text-sm font-semibold text-brand">Abrir libro →</Link></li>)}</ul> : <p className="mt-4 text-sm text-muted">No hay importaciones guardadas en este período.</p>}</section>}
      {activeModule === "cierre" && periodEvents.error && <p role="alert">No se pudo consultar el estado del período.</p>}
      {activeModule === "cierre" && period.length !== 7 && <p className="rounded-xl border p-4 text-sm text-muted">Selecciona un mes específico para gestionar su cierre.</p>}
      {activeModule === "honorarios" && <section id="honorarios" className="min-w-0 scroll-mt-20 space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Boletas de honorarios recibidas</h2>
        <p className="text-sm text-muted">Documentos registrados para revisión. El cruce con Staff compara la liquidación del período por RUT y no genera pagos.</p>
        {fees === null ? <p role="alert">No se pudieron consultar las boletas.</p> : <>
          {!fees.length && <p className="text-sm">Sin boletas registradas en este período.</p>}
          {fees.map(fee => <details className="min-w-0 rounded-lg border p-3" key={fee.id}>
            <summary className="cursor-pointer break-words text-sm">{fee.issuer_name} · Folio {fee.folio} · {clp.format(fee.gross)}</summary>
            <p className="mt-2 break-words text-sm">{fee.issuer_rut} · {fee.issued_on} · {receivedFeeReview(fee)}</p>
            <p className="text-sm">Retención {clp.format(fee.withheld)} · Líquido {clp.format(fee.net)}</p>
            {fee.has_pdf && <ReceivedFeePdf id={fee.id} />}
          </details>)}
          {period.length === 7 && !closed && !periodEvents.error && <SiiReceivedFeeForm period={period} />}
        </>}
      </section>}
      {(activeModule === "importar" || (showRcv && activeModule !== "home")) && (rows === null ? <p role="alert">El registro guardado no se pudo cargar.</p> : <SiiRcvPreview key={`${period}-${activeModule}`} saved={saved} categoryPeriod={period.length === 7 && !closed && !periodEvents.error ? period : undefined} initialBook={selected.libro === "ventas" ? "Ventas" : "Compras"} mode={activeModule === "importar" ? "import" : "book"} /> )}
    </main>
  );
}

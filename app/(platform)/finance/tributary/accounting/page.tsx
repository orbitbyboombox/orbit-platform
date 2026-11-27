import Link from "next/link";
import { ReceivedFeePdf } from "@/features/finance/components/received-fee-pdf";
import { SiiReceivedFeeForm } from "@/features/finance/components/sii-received-fee-form";
import { loadReceivedFees, receivedFeeReview } from "@/features/finance/sii-received-fees";
import { notFound } from "next/navigation";
import { SiiRcvPreview } from "@/features/finance/components/sii-rcv-preview";
import { loadRcvReport, loadStaffPeriodAmounts, siiCompanyRut, summarizeRcvAmounts } from "@/features/finance/sii-rcv-report";
import { recordRcvPeriodEvent } from "@/features/finance/sii-rcv-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ period?: string; year?: string; month?: string; libro?: string }> }) {
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
  const [rows, periodEvents, staffAmounts, fees] = await Promise.all([
    loadRcvReport(period).catch(() => null),

    period.length === 7 ? createAdminClient().from("sii_rcv_period_events" as never).select("action").eq("company_rut", siiCompanyRut)
      .eq("period", `${period}-01`).order("id", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    loadStaffPeriodAmounts(period).catch(() => null),
    loadReceivedFees(period).catch(() => null),
  ]);
  const saved = {
    Compras: (rows ?? []).filter(row => row.register === "Compras").map(row => ({ ...row.snapshot, expenseCategory: row.expense_category })),
    Ventas: (rows ?? []).filter(row => row.register === "Ventas").map(row => row.snapshot),
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
      <Link href="/finance/tributary" className="text-sm font-semibold text-brand">Volver al Centro tributario</Link>
      <h1 className="text-3xl font-semibold">Contabilidad Premium</h1>
      <form className="grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-3" method="get">
        {selected.libro && <input type="hidden" name="libro" value={selected.libro} />}
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
      <nav aria-label="Contabilidad" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Link href={`?period=${period}&libro=compras#libros`} className="rounded-xl border p-3 text-sm font-semibold text-brand">Libro de Compras</Link>
        <Link href={`?period=${period}&libro=ventas#libros`} className="rounded-xl border p-3 text-sm font-semibold text-brand">Libro de Ventas</Link>
        <a href="#honorarios" className="rounded-xl border p-3 text-sm font-semibold text-brand">Boletas de Honorarios</a>
        <a href="#importar-sii" className="rounded-xl border p-3 text-sm font-semibold text-brand">Importar / actualizar CSV del SII</a>
      </nav>
      {rows && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[[ "Compras", saved.Compras.length ], [ "Ventas", saved.Ventas.length ], [ "Diferencias por revisar", rows.filter(row => row.has_difference).length ]].map(([label, value]) =>
          <div key={label} className="rounded-xl border bg-card p-3"><p className="text-sm text-muted">{label}</p><strong className="text-xl">{value}</strong></div>
        )}
      </div>}
      {rows && <section className="grid min-w-0 gap-3 lg:grid-cols-2" aria-label="Importes del Registro de Compras y Ventas">
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
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Flujo de caja · pagos Staff registrados</h2>
        {staffAmounts ? <dl className="mt-3 grid grid-cols-2 gap-3">
          <div><dt className="text-sm text-muted">Pagado</dt><dd>{clp.format(staffAmounts.paid)}</dd></div>
          <div><dt className="text-sm text-muted">Retenciones registradas</dt><dd>{staffAmounts.withheld === null ? "Sin informar" : clp.format(staffAmounts.withheld)}</dd></div>
          {staffAmounts.missing > 0 && <div className="col-span-2 text-sm text-muted">{staffAmounts.missing} pagos sin retención informada.</div>}
        </dl> : <p role="alert">No se pudieron cargar los pagos Staff.</p>}
      </section>
      {period.length === 7 && !periodEvents.error && <section className="space-y-3 rounded-xl border p-3">
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
      <section id="honorarios" className="min-w-0 scroll-mt-20 space-y-3 rounded-xl border bg-card p-4">
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
      </section>
      {rows === null ? <p role="alert">El registro guardado no se pudo cargar.</p> : <SiiRcvPreview key={`${period}-${selected.libro ?? ""}`} saved={saved} initialBook={selected.libro === "ventas" ? "Ventas" : "Compras"} /> }
    </main>
  );
}

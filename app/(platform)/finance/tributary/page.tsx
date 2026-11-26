/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { TributaryDraftManager } from "@/features/finance/components/tributary-draft-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const sections = [
  { key: "facturas", title: "Facturas electrónicas", dte: "DTE 33", folder: "01_FACTURAS", description: "Preparar y revisar facturas vinculadas a eventos y clientes." },
  { key: "boletas", title: "Boletas electrónicas", dte: "DTE 39", folder: "02_BOLETAS", description: "Preparar boletas de servicios con datos del cliente." },
  { key: "guias", title: "Guías de despacho", dte: "DTE 52", folder: "03_GUIAS_DE_DESPACHO", description: "Vincular traslado, equipamiento, vehículo y responsable." },
  { key: "notas-credito", title: "Notas de crédito", dte: "DTE 61", folder: "04_NOTAS_DE_CREDITO", description: "Corregir, devolver o anular un documento de prueba." },
  { key: "notas-debito", title: "Notas de débito", dte: "DTE 56", folder: "05_NOTAS_DE_DEBITO", description: "Ajustar documentos relacionados en ambiente de prueba." },
] as const;

const archiveFolders = [
  "01_FACTURAS",
  "02_BOLETAS",
  "03_GUIAS_DE_DESPACHO",
  "04_NOTAS_DE_CREDITO",
  "05_NOTAS_DE_DEBITO",
  "06_REGISTRO_COMPRAS",
  "07_REGISTRO_VENTAS",
  "08_RESPALDOS_Y_ACUSES_SII",
];

export default async function TributaryCenterPage({ searchParams }: { searchParams: Promise<{ prepare?: string; project?: string; customer?: string }> }) {
  const { prepare, project: projectId, customer: customerId } = await searchParams;
  const client = await createSupabaseServerClient();
  const { data: documents } = await client
    .from("documents")
    .select("id,project_id,external_tax_document_type,external_folio,external_issue_date,created_at")
    .is("deleted_at", null)
    .not("external_folio", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: drafts } = await client.from("invoices").select("id,invoice_number,status,amount,tributary_document_type,project_id,updated_at,approved_at,tributary_snapshot").eq("record_origin", "PRE_SII").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100);
  const { data: ledger } = await client.from("tributary_internal_ledger").select("source_type,document_type,reference,occurred_on,net_amount,exempt_amount,vat_amount,total_amount,payment_status,record_origin").order("occurred_on", { ascending: false }).limit(100);
  const rows = documents ?? [];
  return (
    <main className="space-y-7" aria-label="Centro SII">
      <header className="rounded-3xl border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Finanzas · SII</p>
        <h1 className="mt-2 text-3xl font-semibold">Centro tributario</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Administración interna de documentos, registros y respaldos. La emisión oficial permanece bloqueada hasta la certificación del SII.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-warning">PRE-SII · Solo preparación</span>
          <span className="rounded-full border px-3 py-1 text-muted">Folio informado: 1104</span>
          <span className="rounded-full border px-3 py-1 text-muted">Inicio objetivo: 2000 · sujeto a autorización</span>
        </div>
      </header>

      <TributaryDraftManager drafts={(drafts ?? []) as any} projectId={projectId} customerId={customerId} />


      {prepare ? (() => {
        const selected = sections.find((section) => section.key === prepare);
        return selected ? <section className="rounded-2xl border border-brand/40 bg-brand/5 p-5" aria-label="Borrador tributario">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Borrador preparado · sin emisión</p>
          <h2 className="mt-2 text-xl font-semibold">{selected.title} · {selected.dte}</h2>
          <p className="mt-2 text-sm text-muted">Revisa los datos comerciales del evento o cliente antes de aprobar. Esta acción no consume folio, no modifica saldos y no envía información al SII.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Link href="/projects" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">Elegir evento</Link><Link href="/customers" className="rounded-xl border px-4 py-2 text-sm font-semibold">Elegir cliente</Link><Link href="/finance/tributary" className="rounded-xl border px-4 py-2 text-sm">Cerrar</Link></div>
        </section> : null;
      })() : null}

      <section aria-label="Documentos tributarios" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.key} href={`/finance/tributary/${section.key}`} className="rounded-2xl border bg-card p-5 transition hover:border-brand/60">
            <div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-[.16em] text-brand">{section.dte}</span><span className="text-xs text-muted">{section.folder}</span></div>
            <h2 className="mt-4 text-lg font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm text-muted">{section.description}</p>
            <span className="mt-4 inline-flex text-sm font-semibold text-brand">Abrir módulo →</span>
          </Link>
        ))}
        <Link href="/finance/tributary/compras" className="rounded-2xl border bg-card p-5 transition hover:border-brand/60"><span className="text-xs font-semibold uppercase tracking-[.16em] text-brand">LIBRO</span><h2 className="mt-4 text-lg font-semibold">Registro de compras</h2><p className="mt-2 text-sm text-muted">Proveedores, respaldos y crédito fiscal sujeto a revisión.</p><span className="mt-4 inline-flex text-sm font-semibold text-brand">Abrir registro →</span></Link>
        <Link href="/finance/tributary/ventas" className="rounded-2xl border bg-card p-5 transition hover:border-brand/60"><span className="text-xs font-semibold uppercase tracking-[.16em] text-brand">LIBRO</span><h2 className="mt-4 text-lg font-semibold">Registro de ventas</h2><p className="mt-2 text-sm text-muted">DTE, eventos, saldos y conciliación interna.</p><span className="mt-4 inline-flex text-sm font-semibold text-brand">Abrir registro →</span></Link>
        <Link href="/finance/tributary/archivo" className="rounded-2xl border bg-card p-5 transition hover:border-brand/60"><span className="text-xs font-semibold uppercase tracking-[.16em] text-brand">ARCHIVO</span><h2 className="mt-4 text-lg font-semibold">Archivo tributario</h2><p className="mt-2 text-sm text-muted">Historial central y estructura anual/mensual preparada.</p><span className="mt-4 inline-flex text-sm font-semibold text-brand">Abrir archivo →</span></Link>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Historial oficial existente</p><h2 className="mt-1 text-xl font-semibold">Documentos vinculados</h2></div><span className="text-sm text-muted">{rows.length} registro{rows.length === 1 ? "" : "s"}</span></div>
        {rows.length ? <ul className="mt-4 divide-y">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span><strong className="block">{row.external_tax_document_type ?? "DTE"}</strong><small className="text-muted">Folio {row.external_folio} · {row.external_issue_date ?? "Fecha pendiente"}</small></span><Link className="text-sm font-semibold text-brand hover:underline" href={`/api/projects/${row.project_id}/documents/${row.id}`}>Abrir documento</Link></li>)}</ul> : <p className="mt-4 text-sm text-muted">No hay documentos oficiales cargados. Las simulaciones de certificación permanecen separadas.</p>}
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Libro interno · compras y ventas</p><h2 className="mt-1 text-xl font-semibold">IVA y conciliación financiera</h2><p className="mt-2 text-sm text-muted">Control interno PRE-SII: neto, exento, IVA crédito/débito y total. No reemplaza el registro oficial del SII.</p></div><div className="flex flex-wrap gap-2"><a className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground" href="/api/finance/tributary/export">Exportar CSV para contador</a><a className="rounded-xl border px-4 py-2 text-sm font-semibold" href="/api/finance/tributary/export?format=xls">Exportar Excel para contador</a></div></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted"><th className="px-2 py-2">Tipo</th><th className="px-2 py-2">Referencia</th><th className="px-2 py-2">Fecha</th><th className="px-2 py-2 text-right">Neto</th><th className="px-2 py-2 text-right">Exento</th><th className="px-2 py-2 text-right">IVA</th><th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2">Estado</th></tr></thead><tbody>{(ledger ?? []).slice(0,12).map((row:any)=><tr className="border-b last:border-0" key={String(row.source_type)+String(row.reference)+String(row.occurred_on)}><td className="px-2 py-2">{row.source_type}</td><td className="px-2 py-2">{row.reference ?? "—"}</td><td className="px-2 py-2">{row.occurred_on ?? "—"}</td><td className="px-2 py-2 text-right">{row.net_amount == null ? "—" : new Intl.NumberFormat("es-CL").format(Number(row.net_amount))}</td><td className="px-2 py-2 text-right">{row.exempt_amount == null ? "—" : new Intl.NumberFormat("es-CL").format(Number(row.exempt_amount))}</td><td className="px-2 py-2 text-right">{row.vat_amount == null ? "—" : new Intl.NumberFormat("es-CL").format(Number(row.vat_amount))}</td><td className="px-2 py-2 text-right">{row.total_amount == null ? "—" : new Intl.NumberFormat("es-CL").format(Number(row.total_amount))}</td><td className="px-2 py-2">{row.payment_status ?? "—"}</td></tr>)}</tbody></table>{!(ledger ?? []).length&&<p className="mt-4 text-sm text-muted">Sin movimientos internos todavía.</p>}</div>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Google Drive · estructura preparada</p><h2 className="mt-1 text-xl font-semibold">FINANZAS SII</h2></div><span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs text-warning">Sin escritura automática PRE-SII</span></div>
        <p className="mt-2 text-sm text-muted">La estructura se utilizará para PDF, XML y acuses cuando exista emisión oficial. No se almacenan PFX, contraseñas ni claves CAF.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{archiveFolders.map((folder) => <div key={folder} className="rounded-xl border bg-background/40 px-3 py-2 text-xs text-muted">{folder}<span className="mt-1 block text-[11px] text-brand">AÑO / MES</span></div>)}</div>
      </section>
    </main>
  );
}

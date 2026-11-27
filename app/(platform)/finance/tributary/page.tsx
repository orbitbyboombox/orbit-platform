/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { FileText, Landmark, ListChecks, FolderOpen, FileSpreadsheet, ShieldCheck, ArrowUpRight, ArrowLeft } from "lucide-react";
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

export default async function TributaryCenterPage({ searchParams }: { searchParams: Promise<{ prepare?: string; project?: string; customer?: string; module?: string; period?: string }> }) {
  const { prepare, project: projectId, customer: customerId, module: requestedModule, period: requestedPeriod } = await searchParams;
  const module = prepare || projectId || customerId ? "documents" : ["documents", "reconciliation", "archive", "accountant", "certification"].includes(requestedModule ?? "") ? requestedModule : "home";
  const currentPeriod = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: "America/Santiago" }).format(new Date());
  const period = requestedPeriod && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(requestedPeriod) ? requestedPeriod : currentPeriod;
  const client = await createSupabaseServerClient();
  const { data: documents } = module === "documents" ? await client
    .from("documents")
    .select("id,project_id,external_tax_document_type,external_folio,external_issue_date,created_at")
    .is("deleted_at", null)
    .not("external_folio", "is", null)
    .order("created_at", { ascending: false })
    .limit(100) : { data: [] };

  const { data: drafts } = module === "documents" ? await client.from("tributary_simulations").select("id,invoice_number,status,amount,tributary_document_type,project_id,updated_at,approved_at,tributary_snapshot").eq("record_origin", "PRE_SII").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100) : { data: [] };
  const { data: ledger } = module === "reconciliation" ? await client.from("tributary_internal_ledger").select("source_type,document_type,reference,occurred_on,net_amount,exempt_amount,vat_amount,total_amount,payment_status,record_origin").order("occurred_on", { ascending: false }).limit(100) : { data: [] };
  const rows = documents ?? [];
  return (
    <main className="space-y-7" aria-label="Centro SII">
      {module !== "home" && <Link href={`/finance/tributary?period=${period}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand"><ArrowLeft size={16}/> Regresar al Centro SII</Link>}
      <header className="rounded-3xl border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Finanzas · SII</p>
        <h1 className="mt-2 text-3xl font-semibold">Finanzas SII</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Administración interna de documentos, registros y respaldos. La emisión oficial permanece bloqueada hasta la certificación del SII.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-warning">PRE-SII · Solo preparación</span>
          <span className="rounded-full border px-3 py-1 text-muted">Folio informado: 1104</span>
          <span className="rounded-full border px-3 py-1 text-muted">Inicio objetivo: 2000 · sujeto a autorización</span>
        </div>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4"><input type="hidden" name="module" value={module ?? "home"}/><label className="text-sm font-medium">Período tributario<input type="month" name="period" defaultValue={period} required className="mt-1 block rounded-lg border bg-background p-2"/></label><button className="min-h-11 rounded-xl border px-4 text-sm font-semibold">Consultar período</button></form>
      {module === "home" && <nav aria-label="Módulos de Finanzas SII" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[
        { title:"Documentos tributarios", description:"Facturas, boletas, guías, notas y borradores", icon:FileText, href:`?module=documents&period=${period}` },
        { title:"Contabilidad Premium", description:"Libros de compras, ventas, honorarios e importaciones", icon:Landmark, href:`/finance/tributary/accounting?period=${period}` },
        { title:"Conciliación", description:"Libro interno, pagos y diferencias", icon:ListChecks, href:`?module=reconciliation&period=${period}` },
        { title:"Archivo digital", description:"Respaldos originales y Google Drive", icon:FolderOpen, href:`?module=archive&period=${period}` },
        { title:"Contador", description:"Paquete mensual y exportaciones", icon:FileSpreadsheet, href:`?module=accountant&period=${period}` },
        { title:"Certificación SII", description:"Estado PRE-SII y preparación tributaria", icon:ShieldCheck, href:`?module=certification&period=${period}` },
      ].map(({title,description,icon:Icon,href}) => <Link key={title} href={href} className="group rounded-2xl border bg-card p-5 transition hover:border-brand/60 focus-visible:outline focus-visible:outline-brand"><div className="flex items-center justify-between"><span className="rounded-xl bg-brand/10 p-3 text-brand"><Icon size={24}/></span><ArrowUpRight size={18} className="text-muted group-hover:text-brand"/></div><h2 className="mt-4 text-lg font-semibold">{title}</h2><p className="mt-2 text-sm text-muted">{description}</p></Link>)}</nav>}
      {module === "certification" && <section className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-semibold">Certificación SII</h2><p className="mt-2 text-sm text-muted">Solicitud 4105647 · pendiente de respuesta oficial. La emisión oficial permanece bloqueada.</p><Link href={`/finance/tributary?module=documents&period=${period}`} className="mt-4 inline-flex text-sm font-semibold text-brand">Consultar preparación PRE-SII →</Link></section>}
      {module === "accountant" && <>
      <div className="flex flex-wrap gap-3 text-sm"><a href="/api/finance/tributary/export?scope=simulation" className="underline">CSV de simulaciones</a><a href="/api/finance/tributary/export?scope=simulation&format=xls" className="underline">Excel de simulaciones</a></div>
      <form action="/api/finance/tributary/export" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border p-4" aria-label="Paquete mensual para el contador">
        <input type="hidden" name="format" value="zip" />
        <label className="text-sm">Año<input name="year" className="mt-1 block w-24 rounded-lg border bg-background p-2" required type="number" min="1000" max="9999" defaultValue={period.slice(0,4)} /></label>
        <label className="text-sm">Mes<select name="month" className="mt-1 block max-w-full rounded-lg border bg-background p-2" defaultValue={Number(period.slice(5))}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, index, 1)))}</option>)}</select></label>
        <button type="submit" className="rounded-lg border border-brand/40 px-3 py-2 text-sm text-brand">Descargar paquete mensual ZIP</button>
      </form>
      </>}
      {module === "documents" && <>
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
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Historial oficial existente</p><h2 className="mt-1 text-xl font-semibold">Documentos vinculados</h2></div><span className="text-sm text-muted">{rows.length} registro{rows.length === 1 ? "" : "s"}</span></div>
        {rows.length ? <ul className="mt-4 divide-y">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span><strong className="block">{row.external_tax_document_type ?? "DTE"}</strong><small className="text-muted">Folio {row.external_folio} · {row.external_issue_date ?? "Fecha pendiente"}</small></span><Link className="text-sm font-semibold text-brand hover:underline" href={`/projects/${row.project_id}/documents/${row.id}/viewer`}>Abrir documento</Link></li>)}</ul> : <p className="mt-4 text-sm text-muted">No hay documentos oficiales cargados. Las simulaciones de certificación permanecen separadas.</p>}
      </section>

      </>}
      {module === "reconciliation" && <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Libro interno · compras y ventas</p><h2 className="mt-1 text-xl font-semibold">IVA y conciliación financiera</h2><p className="mt-2 text-sm text-muted">Control interno PRE-SII: neto, exento, IVA crédito/débito y total. No reemplaza el registro oficial del SII.</p></div><div className="flex flex-wrap gap-2"><a className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground" href="/api/finance/tributary/export">Exportar CSV para contador</a><a className="rounded-xl border px-4 py-2 text-sm font-semibold" href="/api/finance/tributary/export?format=xls">Exportar Excel para contador</a></div></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted"><th className="px-2 py-2">Tipo</th><th className="px-2 py-2">Referencia</th><th className="px-2 py-2">Fecha</th><th className="px-2 py-2 text-right">Neto</th><th className="px-2 py-2 text-right">Exento</th><th className="px-2 py-2 text-right">IVA</th><th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2">Estado</th></tr></thead><tbody>{(ledger ?? []).slice(0,12).map((row:any)=><tr className="border-b last:border-0" key={String(row.source_type)+String(row.reference)+String(row.occurred_on)}><td className="px-2 py-2">{row.source_type}</td><td className="px-2 py-2">{row.reference ?? "—"}</td><td className="px-2 py-2">{row.occurred_on ?? "—"}</td><td className="px-2 py-2 text-right">{row.net_amount == null ? "—" : new Intl.NumberFormat("es-CL").format(Number(row.net_amount))}</td><td className="px-2 py-2 text-right">{row.exempt_amount == null ? "—" : new Intl.NumberFormat("es-CL").format(Number(row.exempt_amount))}</td><td className="px-2 py-2 text-right">{row.vat_amount == null ? "—" : new Intl.NumberFormat("es-CL").format(Number(row.vat_amount))}</td><td className="px-2 py-2 text-right">{row.total_amount == null ? "—" : new Intl.NumberFormat("es-CL").format(Number(row.total_amount))}</td><td className="px-2 py-2">{row.payment_status ?? "—"}</td></tr>)}</tbody></table>{!(ledger ?? []).length&&<p className="mt-4 text-sm text-muted">Sin movimientos internos todavía.</p>}</div>
      </section>}

      {module === "archive" && <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Google Drive · estructura preparada</p><h2 className="mt-1 text-xl font-semibold">FINANZAS SII</h2></div><span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs text-warning">Sin escritura automática PRE-SII</span></div>
        <p className="mt-2 text-sm text-muted">La estructura se utilizará para PDF, XML y acuses cuando exista emisión oficial. No se almacenan PFX, contraseñas ni claves CAF.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{archiveFolders.map((folder) => <div key={folder} className="rounded-xl border bg-background/40 px-3 py-2 text-xs text-muted">{folder}<span className="mt-1 block text-[11px] text-brand">AÑO / MES</span></div>)}</div>
        <div className="mt-4 flex flex-wrap gap-3"><Link href="/finance/tributary/archivo" className="rounded-xl border px-4 py-2 text-sm font-semibold text-brand">Abrir archivo tributario</Link><Link href="/finance/tributary/drive-verification" className="rounded-xl border px-4 py-2 text-sm font-semibold text-brand">Diagnóstico Drive</Link></div>
      </section>}
    </main>
  );
}

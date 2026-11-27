import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const config: Record<string, { title: string; dte?: string; folder: string; description: string; filter?: string }> = {
  facturas: { title: "Facturas electrónicas", dte: "DTE 33", folder: "01_FACTURAS", description: "Preparación de facturas vinculadas a cotizaciones aceptadas, eventos y clientes.", filter: "33" },
  boletas: { title: "Boletas electrónicas", dte: "DTE 39", folder: "02_BOLETAS", description: "Preparación de boletas con datos tributarios del receptor.", filter: "39" },
  guias: { title: "Guías de despacho", dte: "DTE 52", folder: "03_GUIAS_DE_DESPACHO", description: "Traslado de equipamiento con origen, destino, vehículo y responsable.", filter: "52" },
  "notas-credito": { title: "Notas de crédito", dte: "DTE 61", folder: "04_NOTAS_DE_CREDITO", description: "Corrección, devolución parcial o anulación sobre un documento relacionado.", filter: "61" },
  "notas-debito": { title: "Notas de débito", dte: "DTE 56", folder: "05_NOTAS_DE_DEBITO", description: "Ajustes documentales vinculados al DTE original.", filter: "56" },
  archivo: { title: "Archivo tributario", folder: "08_RESPALDOS_Y_ACUSES_SII", description: "Historial central de documentos y respaldos separados por ambiente." },
};

export default async function TributarySectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ period?: string }> }) {
  const { section } = await params;
  const { period: requested } = await searchParams;
  const period = requested && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(requested) ? requested : new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",timeZone:"America/Santiago"}).format(new Date());
  const [year,month] = period.split("-").map(Number);
  const end = `${month===12?year+1:year}-${String(month===12?1:month+1).padStart(2,"0")}-01`;
  if (section === "compras" || section === "ventas") redirect(`/finance/tributary/accounting?period=${period}&libro=${section}#libros`);
  const current = config[section];
  if (!current) return <main className="rounded-3xl border bg-card p-8"><h1 className="text-2xl font-semibold">Módulo no disponible</h1><Link className="mt-4 inline-flex text-brand underline" href="/finance/tributary">Volver al Centro SII</Link></main>;

  const client = await createSupabaseServerClient();
  const {data:{user}} = await client.auth.getUser();
  if (!user) notFound();
  const {data:profile} = await client.from("profiles").select("role").eq("id",user.id).single();
  if (!profile || !["CEO","ADMINISTRATOR"].includes(profile.role)) notFound();
  const query = client.from("documents").select("id,project_id,external_tax_document_type,external_folio,external_issue_date,created_at").is("deleted_at", null).not("external_folio", "is", null).gte("external_issue_date",`${period}-01`).lt("external_issue_date",end).order("created_at", { ascending: false }).limit(100);
  const { data } = current.filter ? await query.eq("external_tax_document_type", current.filter) : await query;
  const rows = data ?? [];

  return <main className="space-y-6" aria-label={current.title}>
    <header className="rounded-3xl border bg-card p-6 sm:p-8"><Link className="text-sm text-brand hover:underline" href={`/finance/tributary?module=${section==="archivo"?"archive":"documents"}&period=${period}`}>← Regresar</Link><p className="mt-5 text-xs font-semibold uppercase tracking-[.2em] text-brand">{current.dte ?? "Registro interno"}</p><h1 className="mt-2 text-3xl font-semibold">{current.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{current.description}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border px-3 py-1 text-xs text-muted">Período {period}</span><span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs text-warning">PRE-SII · No emisión real</span></div></header>
    {section !== "archivo" && <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-5"><div><h2 className="font-semibold">Preparación controlada</h2><p className="mt-1 text-sm text-muted">Los datos se toman de las fuentes oficiales existentes. El borrador no consume folio ni modifica saldos.</p></div><Link href={`/finance/tributary?prepare=${section}&period=${period}`} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">Preparar borrador</Link></section>}
    <section className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Historial disponible</h2><span className="text-sm text-muted">{rows.length} registro{rows.length === 1 ? "" : "s"}</span></div>{rows.length ? <ul className="mt-4 divide-y">{rows.map(row => <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={row.id}><span><strong className="block">{row.external_tax_document_type ?? current.dte ?? "Documento"}</strong><small className="text-muted">Folio {row.external_folio} · {row.external_issue_date ?? "Fecha pendiente"}</small></span><Link className="text-sm text-brand hover:underline" href={`/projects/${row.project_id}/documents/${row.id}/viewer?returnTo=${encodeURIComponent(`/finance/tributary/${section}?period=${period}`)}`}>Abrir documento</Link></li>)}</ul> : <p className="mt-4 text-sm text-muted">No hay documentos oficiales en este registro. Las pruebas permanecen separadas.</p>}</section>
  </main>;
}

"use client";

import type { RcvEvidence } from "../sii-rcv-report";
import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import { assignRcvPurchaseCategory, storeRcvForReview } from "../sii-rcv-actions";
import { normalizeRcv, parseSiiRcv, readSiiRcvFilename } from "../sii-rcv";

type ParsedRegister = ReturnType<typeof parseSiiRcv>;
type DisplayDocument = ParsedRegister["documents"][number] & { evidence?: RcvEvidence };
type Register = { kind: ParsedRegister["kind"]; documents: DisplayDocument[] };
const formatMoney = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" });
const amount = (value: number | null) => value === null ? "Sin informar" : formatMoney.format(value);

const categories = {
  FUEL: "Combustible", SUPPLIES: "Insumos", MAINTENANCE: "Mantención", TRANSPORT: "Transporte",
  SERVICES: "Servicios", PAYROLL: "Personal", ADMINISTRATION: "Administración", OTHER: "Otro",
};
function PurchaseCategoryForm({ period, doc }: { period: string; doc: Register["documents"][number] }) {
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="mt-3 grid min-w-0 gap-2 border-t pt-3" action={form => startTransition(async () => {
    try { setNotice((await assignRcvPurchaseCategory(form)).message); }
    catch { setNotice("No se pudo guardar la categoría."); }
  })}>
    <input type="hidden" name="period" value={period} />
    <input type="hidden" name="key" value={doc.key} />
    <label className="text-sm">Categoría
      <select name="category" required defaultValue={doc.expenseCategory ?? ""} className="mt-1 block w-full rounded-lg border bg-background p-2">
        <option value="">Selecciona una categoría</option>
        {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    <label className="text-sm">Motivo de la corrección
      <input name="reason" required maxLength={500} className="mt-1 block w-full rounded-lg border bg-background p-2" />
    </label>
    <button disabled={pending} className="min-h-11 rounded-lg border px-3 text-sm" type="submit">Guardar categoría</button>
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </form>;
}

export function SiiRcvPreview({ saved, initialBook = "Compras", categoryPeriod, mode = "book", bookPeriod, initialPage = 1, initialMonth = "", initialType = "", initialCategory = "", initialMatch = "", initialDocument = "" }: { saved: Record<Register["kind"], Register["documents"]>; initialBook?: Register["kind"]; categoryPeriod?: string; mode?: "book" | "import"; bookPeriod?: string; initialPage?: number; initialMonth?: string; initialType?: string; initialCategory?: string; initialMatch?: string; initialDocument?: string }) {
  const [registers, setRegisters] = useState<Partial<Record<Register["kind"], Register>>>({});
  const [page, setPage] = useState(initialPage);
  const [kind, setKind] = useState<Register["kind"]>(initialBook);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (mode !== "book" || !initialDocument || !bookPeriod) return;
    try { const key = `orbit:rcv:return:${bookPeriod}:${initialBook}`; const value = sessionStorage.getItem(key); sessionStorage.removeItem(key); if (value !== null) setQuery(value.slice(0, 250)); } catch { /* storage unavailable */ }
  }, [bookPeriod, initialBook, initialDocument, mode]);
  const [month, setMonth] = useState(initialMonth);
  const [type, setType] = useState(initialType);
  const [category, setCategory] = useState(initialCategory);
  const [match, setMatch] = useState(initialMatch);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ file: File; kind: Register["kind"] } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [storedPeriod, setStoredPeriod] = useState("");
  const [storedKind, setStoredKind] = useState<Register["kind"]>(initialBook);
  const [saving, startSaving] = useTransition();
  const documents = registers[kind]?.documents ?? saved[kind];
  function saveReview() {
    if (!source || !confirmed) return;
    const form = new FormData();
    form.set("file", source.file);
    form.set("confirmed", "yes");
    startSaving(async () => {
      const result = await storeRcvForReview(form);
      setNotice(result.message);
      setConfirmed(false);
      if (result.saved) { setStoredKind(source.kind); setStoredPeriod(result.period ?? ""); setSource(null); setRegisters({}); }
    });
  }
  const results = documents.filter(doc =>
    (!month || doc.issued.startsWith(month))
    && (!type || doc.type === type)
    && (!category || (doc.expenseCategory || "PENDING") === category)
    && (!match || (doc.evidence?.match_status ?? "PENDING") === match)
    && normalizeRcv([doc.company, doc.rut, doc.folio, doc.issued, doc.total, amount(doc.total)].join(" ")).includes(normalizeRcv(query)),
  ).sort((left, right) => right.issued.localeCompare(left.issued) || left.company.localeCompare(right.company, "es") || left.folio.localeCompare(right.folio, "es", { numeric: true }));

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = results.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function viewerReturn(documentId: string) {
    const params = new URLSearchParams({ period: bookPeriod ?? "", libro: kind.toLowerCase(), page: String(currentPage), document: documentId });
    for (const [key, value] of Object.entries({ issued: month, type, category, match })) if (value) params.set(key, value);
    return `/finance/tributary/accounting?${params.toString()}#libros`;
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    setSource(null);
    setRegisters({});
    setStoredPeriod("");
    setPage(1);
    setQuery("");
    setCategory("");
    setMatch("");
    setConfirmed(false);
    setNotice("");
    try {
      if (file.size > 1_000_000) throw new Error("Selecciona un archivo de hasta 1 MB.");
      const meta = readSiiRcvFilename(file.name);
      const register = parseSiiRcv(await file.arrayBuffer());
      if (meta.kind !== register.kind) throw new Error("El nombre y el registro del archivo no coinciden.");
      setRegisters(current => ({ ...current, [register.kind]: register }));
      setSource({ file, kind: register.kind });
      setKind(register.kind);
      setType("");
      setMonth("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo leer el archivo.");
    }
  }

  return (
    <section id="libros" className="scroll-mt-20 space-y-5 rounded-3xl border bg-card p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">{mode === "import" ? "Importar / actualizar CSV del SII" : `Libro de ${kind.toLowerCase()}`}</h2>
        <p className="mt-1 text-sm text-muted">Revisa y confirma los documentos para guardarlos. Las diferencias quedan pendientes de revisión y no generan movimientos contables.</p>
      </div>
      {mode === "import" && <label id="importar-sii" className="block scroll-mt-20 text-sm font-semibold">
        Importar / actualizar CSV del SII
        <input className="mt-2 block w-full text-sm" type="file" accept=".csv,text/csv" disabled={saving} onChange={loadFile} />
      </label>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {source && source.kind === kind && <div className="space-y-2 rounded-xl border p-3">
        <p className="text-sm break-all">{source.file.name}</p>
        <p className="text-sm">Período tributario: {readSiiRcvFilename(source.file.name).period}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          Confirmo guardar este archivo y sus documentos para revisión.
        </label>
        <button type="button" disabled={!confirmed || saving} onClick={saveReview} className="min-h-11 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar para revisión"}
        </button>
      </div>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {storedPeriod && <a className="inline-flex min-h-11 items-center text-sm font-semibold text-brand" href={`?period=${storedPeriod}&libro=${storedKind.toLowerCase()}#libros`}>Consultar período {storedPeriod}</a>}
      {mode === "import" && <div className="flex flex-wrap gap-2" aria-label="Registro">
        {(["Compras", "Ventas"] as const).map(label => (
          <button key={label} type="button" aria-pressed={kind === label} disabled={saving || (!!source && source.kind !== label)} onClick={() => { setKind(label); setType(""); setMonth(""); setPage(1); setCategory(""); setMatch(""); }}
            className="min-h-11 rounded-xl border px-4 text-sm font-semibold aria-pressed:border-brand aria-pressed:text-brand">
            {label} · {registers[label]?.documents.length ?? saved[label].length}
          </button>
        ))}
      </div>}
      {mode === "book" && saved[kind].length === 0 && <p className="rounded-xl border p-4 text-sm text-muted">No hay documentos para este período.</p>}
      {(mode === "book" || source) && (registers[kind] || saved[kind].length > 0) && <>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">Buscar
            <input className="mt-1 block w-full rounded-lg border bg-background p-2" value={query}
              placeholder="Nombre, RUT, folio, fecha o monto" onChange={event => { setQuery(event.target.value); setPage(1); }} />
          </label>
          <label className="text-sm">Mes de emisión
            <input className="mt-1 block w-full rounded-lg border bg-background p-2" type="month" value={month} onChange={event => { setMonth(event.target.value); setPage(1); }} />
          </label>
          <label className="text-sm">Tipo de documento
            <select className="mt-1 block w-full rounded-lg border bg-background p-2" value={type} onChange={event => { setType(event.target.value); setPage(1); }}>
              <option value="">Todos</option>
              {[...new Set(documents.map(doc => doc.type))].map(label => <option key={label}>{label}</option>)}
            </select>
          </label>
        </div>
        {mode === "book" && <div className="grid gap-3 sm:grid-cols-2">{kind === "Compras" && <label className="text-sm">Categoría<select value={category} onChange={event=>{setCategory(event.target.value);setPage(1)}} className="mt-1 block w-full rounded-lg border bg-background p-2"><option value="">Todas</option><option value="PENDING">Por revisar</option>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}<label className="text-sm">Conciliación<select value={match} onChange={event=>{setMatch(event.target.value);setPage(1)}} className="mt-1 block w-full rounded-lg border bg-background p-2"><option value="">Todas</option><option value="MATCHED">Coincidencia interna</option><option value="PENDING">Sin coincidencia</option><option value="AMBIGUOUS">Coincidencias múltiples</option></select></label></div>}
        <p className="text-sm text-muted" aria-live="polite">{results.length} documentos · mostrando {visible.length}</p>
        {!results.length && <p className="rounded-xl border p-4 text-sm text-muted">No se encontraron documentos con estos filtros.</p>}
        {visible.map((doc, index) => (
          <details key={`${doc.key}-${index}`} open={doc.evidence?.pdf_id === initialDocument && !!initialDocument ? true : undefined} className="rounded-xl border p-3">
            <summary className="cursor-pointer break-words text-sm"><span className="inline-grid w-[94%] min-w-0 gap-1 align-middle sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-center"><span className="min-w-0"><strong className="block break-words">{doc.company || doc.rut}</strong><span className="text-xs text-muted">{doc.type} · Folio {doc.folio}</span></span><span className="text-xs text-muted">{doc.issued}{kind === "Compras" && <span className="block">{doc.expenseCategory ? categories[doc.expenseCategory as keyof typeof categories] ?? doc.expenseCategory : "Por revisar"}</span>}</span><strong className="tabular-nums sm:text-right">{amount(doc.total)}</strong></span></summary>
            {doc.duplicate && <p className="mt-2 text-sm text-danger">Identificador repetido. Requiere revisión.</p>}
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries({
                ...(kind === "Compras" && { "Categoría de gasto": doc.expenseCategory ? categories[doc.expenseCategory as keyof typeof categories] ?? doc.expenseCategory.replaceAll("_", " ").toLocaleLowerCase("es-CL") : "Por revisar" }),
                "RUT": doc.rut, "Fecha de emisión": doc.issued, "Neto": amount(doc.net), "Exento": amount(doc.exempt),
                [kind === "Compras" ? "IVA recuperable informado por el SII" : "IVA informado por el SII"]: amount(doc.vat),
                "IVA no recuperable": amount(doc.nonRecoverableVat),
                "Impuestos adicionales": doc.otherTaxes.length ? doc.otherTaxes.map(amount).join(" + ") : "Sin informar",
                "Total": amount(doc.total),
              }).map(([label, value]) => <div key={label}><dt className="text-muted">{label}</dt><dd>{value}</dd></div>)}
            </dl>
            {doc.evidence && <div className="mt-3 space-y-2 border-t pt-3 text-sm">
              <p><strong>Finanzas:</strong> {doc.evidence.match_status === "MATCHED" ? "Coincidencia interna"
                : doc.evidence.match_status === "AMBIGUOUS" ? "Coincidencias múltiples · revisar" : "Sin coincidencia exacta"}</p>
              <p className="text-muted">{doc.evidence.pdf_id ? "PDF original vinculado" : "PDF original no disponible"} · {doc.evidence.xml_id ? "XML original vinculado" : "XML original no disponible"}</p>
              {doc.evidence.paid !== null && <p>Pagado registrado: {amount(doc.evidence.paid)} · Saldo interno: {amount(doc.evidence.balance)}</p>}
              {doc.evidence.project_id && <div className="flex flex-wrap gap-3">
                <a className="text-brand" href={`/projects/${doc.evidence.project_id}?eventTab=FINANCE`}>Event 360°</a>
                {doc.evidence.pdf_id && <a className="text-brand" href={`/projects/${doc.evidence.project_id}/documents/${doc.evidence.pdf_id}/viewer?returnTo=${encodeURIComponent(viewerReturn(doc.evidence.pdf_id))}`} onClick={() => { try { sessionStorage.setItem(`orbit:rcv:return:${bookPeriod}:${kind}`, query.slice(0,250)); } catch { /* storage unavailable */ } }}>PDF original</a>}
                {doc.evidence.xml_id && <a className="text-brand" href={`/api/projects/${doc.evidence.project_id}/documents/${doc.evidence.xml_id}?download=1`}>XML original</a>}
              </div>}
            </div>}
            {kind === "Compras" && categoryPeriod && !registers.Compras && <PurchaseCategoryForm period={categoryPeriod} doc={doc} />}
          </details>
        ))}
        {pageCount > 1 && <nav aria-label="Paginación de documentos" className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-40">Anterior</button><span className="text-sm text-muted">Página {currentPage} de {pageCount}</span><button type="button" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-40">Siguiente</button></nav>}
      </>}
    </section>
  );
}

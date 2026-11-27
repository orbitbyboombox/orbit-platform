"use client";

import { useState, type ChangeEvent } from "react";
import { normalizeRcv, parseSiiRcv } from "../sii-rcv";

type Register = ReturnType<typeof parseSiiRcv>;
const formatMoney = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" });
const amount = (value: number | null) => value === null ? "Sin informar" : formatMoney.format(value);

export function SiiRcvPreview() {
  const [registers, setRegisters] = useState<Partial<Record<Register["kind"], Register>>>({});
  const [kind, setKind] = useState<Register["kind"]>("Compras");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const documents = registers[kind]?.documents ?? [];
  const results = documents.filter(doc =>
    (!month || doc.issued.startsWith(month))
    && (!type || doc.type === type)
    && normalizeRcv([doc.company, doc.rut, doc.folio, doc.issued, doc.total, amount(doc.total)].join(" ")).includes(normalizeRcv(query)),
  );

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    try {
      if (file.size > 5_000_000) throw new Error("Selecciona un archivo de hasta 5 MB.");
      const register = parseSiiRcv(await file.arrayBuffer());
      setRegisters(current => ({ ...current, [register.kind]: register }));
      setKind(register.kind);
      setType("");
      setMonth("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo leer el archivo.");
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border bg-card p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Vista previa del Registro de Compras y Ventas</h2>
        <p className="mt-1 text-sm text-muted">Consulta local. Los documentos se conservan solo mientras esta página esté abierta.</p>
      </div>
      <label className="block text-sm font-semibold">
        Abrir exportación del SII
        <input className="mt-2 block w-full text-sm" type="file" accept=".csv,text/csv" onChange={loadFile} />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2" aria-label="Registro">
        {(["Compras", "Ventas"] as const).map(label => (
          <button key={label} type="button" aria-pressed={kind === label} onClick={() => { setKind(label); setType(""); setMonth(""); }}
            className="min-h-11 rounded-xl border px-4 text-sm font-semibold aria-pressed:border-brand aria-pressed:text-brand">
            {label} · {registers[label]?.documents.length ?? 0}
          </button>
        ))}
      </div>
      {registers[kind] && <>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">Buscar
            <input className="mt-1 block w-full rounded-lg border bg-background p-2" value={query}
              placeholder="Nombre, RUT, folio, fecha o monto" onChange={event => setQuery(event.target.value)} />
          </label>
          <label className="text-sm">Período
            <input className="mt-1 block w-full rounded-lg border bg-background p-2" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          </label>
          <label className="text-sm">Tipo de documento
            <select className="mt-1 block w-full rounded-lg border bg-background p-2" value={type} onChange={event => setType(event.target.value)}>
              <option value="">Todos</option>
              {[...new Set(documents.map(doc => doc.type))].map(label => <option key={label}>{label}</option>)}
            </select>
          </label>
        </div>
        <p className="text-sm text-muted" aria-live="polite">{results.length} documentos</p>
        {results.map((doc, index) => (
          <details key={`${doc.key}-${index}`} className="rounded-xl border p-3">
            <summary className="cursor-pointer break-words text-sm">
              <strong>{doc.company || doc.rut}</strong> · {doc.type} · Folio {doc.folio} · {amount(doc.total)}
            </summary>
            {doc.duplicate && <p className="mt-2 text-sm text-danger">Identificador repetido. Requiere revisión.</p>}
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries({
                "RUT": doc.rut, "Fecha de emisión": doc.issued, "Neto": amount(doc.net), "Exento": amount(doc.exempt),
                [kind === "Compras" ? "IVA recuperable informado por el SII" : "IVA informado por el SII"]: amount(doc.vat),
                "IVA no recuperable": amount(doc.nonRecoverableVat),
                "Impuestos adicionales": doc.otherTaxes.length ? doc.otherTaxes.map(amount).join(" + ") : "Sin informar",
                "Total": amount(doc.total),
              }).map(([label, value]) => <div key={label}><dt className="text-muted">{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </details>
        ))}
      </>}
    </section>
  );
}

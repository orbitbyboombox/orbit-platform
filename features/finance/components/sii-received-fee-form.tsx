"use client";

import { useState, useTransition } from "react";
import { storeReceivedFee } from "../sii-rcv-actions";

export function SiiReceivedFeeForm({ period }: { period: string }) {
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const fields = [
    ["name", "Nombre del prestador", "text"], ["rut", "RUT", "text"], ["folio", "Folio", "text"],
    ["issued", "Fecha de emisión", "date"], ["gross", "Monto bruto", "number"], ["withheld", "Retención", "number"],
  ];
  return <details className="min-w-0 rounded-xl border p-3">
    <summary className="cursor-pointer font-semibold">Registrar boleta individual</summary>
    <form action={form => startTransition(async () => {
      try { setNotice((await storeReceivedFee(form)).message); }
      catch { setNotice("No se pudo registrar la boleta."); }
    })} className="mt-3 space-y-3">
      <input type="hidden" name="period" value={period} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">{fields.map(([name, title, type]) => (
        <label key={name} className="min-w-0 text-sm">{title}
          <input name={name} type={type} required className="mt-1 block min-w-0 w-full rounded-lg border bg-background p-2" />
        </label>
      ))}</div>
      <label className="block min-w-0 text-sm">PDF original · opcional
        <input name="pdf" type="file" accept=".pdf,application/pdf" className="mt-1 block w-full text-sm" />
      </label>
      <button disabled={pending} className="min-h-11 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50" type="submit">
        {pending ? "Guardando…" : "Guardar para revisión"}
      </button>
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </form>
  </details>;
}

"use client";

import { buildEventTotemRoster } from "./event-totem-roster";
import type { EventTotemLayout } from "./event-totem-layout";

/** Printable event distribution, using the last saved layout only. */
export function EventTotemRosterPrint({
  eventName, layout, blocks, boxes, assignments,
}: {
  eventName: string;
  layout: EventTotemLayout;
  blocks: Array<{ id: string; name: string }>;
  boxes: Array<{ id: string; label: string }>;
  assignments: Array<{ id: string; label: string }>;
}) {
  if (!layout.enabled) return null;
  const sections = buildEventTotemRoster(layout, blocks, new Map(boxes.map(item => [item.id, item.label])), new Map(assignments.map(item => [item.id, item.label])));
  const totalBoxes = layout.positions.filter(item => item.assetId).length;
  return <section className="totem-print-root rounded-2xl border bg-white p-5 text-slate-950 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
    <style>{`@page { size: A4 landscape; margin: 11mm; }
      @media print {
        html, body { background: #fff !important; color: #111827 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .totem-print-root { width: 100% !important; max-width: none !important; color: #111827 !important; background: #fff !important; font-family: Arial, Helvetica, sans-serif !important; }
        .totem-print-root * { color: inherit; }
        .totem-print-page { break-after: page; page-break-after: always; }
        .totem-print-page:last-child { break-after: auto; page-break-after: auto; }
        .totem-print-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
        .totem-print-table th { background: #111827 !important; color: #fff !important; }
        .totem-print-table th, .totem-print-table td { border: 1px solid #cbd5e1; padding: 12px 10px; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; vertical-align: middle; }
        .totem-print-table tbody tr:nth-child(even) { background: #f1f5f9 !important; }
      }`}</style>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div><h2 className="text-lg font-bold">Distribución oficial de tótems</h2><p className="text-sm text-slate-600">Vista premium lista para impresión horizontal, con una página por bloque.</p></div>
      <button type="button" className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white" onClick={() => window.print()}>Imprimir / guardar PDF</button>
    </div>
    {sections.map((section, sectionIndex) => <div key={section.blockId} className="totem-print-page mb-8 print:mb-0">
      <header className="mb-5 flex items-start justify-between gap-5 border-b-4 border-slate-900 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-slate-600">BOOMBOX · ORBIT v2.1.5</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Distribución de tótems</h1>
          <p className="mt-1 text-sm font-semibold text-slate-700">{eventName}</p>
        </div>
        <div className="rounded-xl bg-slate-900 px-5 py-3 text-right text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Bloque operacional</p>
          <p className="mt-1 text-xl font-black text-white">{section.title}</p>
        </div>
      </header>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"><strong>{section.rows.length}</strong> posiciones</span>
        <span className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"><strong>{totalBoxes}</strong> cajas físicas</span>
        <span className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"><strong>{section.rows.filter(row => row.operator && row.operator !== "Sin asignar").length}</strong> operadores indicados</span>
      </div>
      <table className="totem-print-table w-full table-fixed border-collapse text-left text-sm">
        <colgroup><col style={{ width: "10%" }}/><col style={{ width: "20%" }}/><col style={{ width: "32%" }}/><col style={{ width: "12%" }}/><col style={{ width: "26%" }}/></colgroup>
        <thead><tr>{["TÓTEM", "UBICACIÓN", "REFERENCIA DE MONTAJE", "CAJA", "OPERADOR"].map(label => <th key={label} className="border border-slate-300 bg-slate-900 p-3 text-xs font-bold tracking-wide text-white">{label}</th>)}</tr></thead>
        <tbody>{section.rows.map((row, index) => <tr key={index} className="even:bg-slate-100"><td className="border border-slate-300 p-3 font-bold">{row.position}</td><td className="border border-slate-300 p-3 font-semibold">{row.location || "—"}</td><td className="border border-slate-300 p-3">{row.reference || "—"}</td><td className="border border-slate-300 p-3 font-bold">{row.box || "—"}</td><td className="border border-slate-300 p-3 font-semibold">{row.operator || "Sin asignar"}</td></tr>)}</tbody>
      </table>
      <footer className="mt-5 flex items-center justify-between border-t border-slate-300 pt-3 text-xs text-slate-600">
        <span>Documento operacional · distribución guardada en ORBIT</span>
        <span>Bloque {sectionIndex + 1} de {sections.length}</span>
      </footer>
    </div>)}
  </section>;
}

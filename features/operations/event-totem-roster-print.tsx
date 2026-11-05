"use client";

import { buildEventTotemRoster } from "./event-totem-roster";
import type { EventTotemLayout } from "./event-totem-layout";

/** Print-ready roster supplement; browser Print -> Save as PDF.
 * Separate from the official roster until its canonical PDF pipeline is integrated. */
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
  return <section className="space-y-4 rounded-xl border p-4 print:border-0 print:p-0">
    <div className="flex items-center justify-between gap-4 print:hidden"><h2 className="font-semibold">Anexo de distribución de tótems</h2><button type="button" className="rounded border px-3 py-2" onClick={() => window.print()}>Imprimir / guardar PDF</button></div>
    <div className="hidden print:block"><h1 className="text-2xl font-bold">BOOMBOX · Distribución de tótems</h1><p>{eventName}</p></div>
    {sections.map(section => <div key={section.blockId} className="break-inside-avoid space-y-2"><h3 className="font-semibold">{section.title}</h3><table className="w-full border-collapse text-left text-xs"><thead><tr>{["Tótem", "Ubicación", "Referencia", "Caja", "Operador"].map(label => <th key={label} className="border p-2">{label}</th>)}</tr></thead><tbody>{section.rows.map((row, index) => <tr key={index}><td className="border p-2">{row.position}</td><td className="border p-2">{row.location}</td><td className="border p-2">{row.reference}</td><td className="border p-2">{row.box}</td><td className="border p-2">{row.operator}</td></tr>)}</tbody></table></div>)}
  </section>;
}

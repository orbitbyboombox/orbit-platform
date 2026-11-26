import { createHash } from "node:crypto";

export const fixtures = [
  { id:"QA-EVT-001", name:"Gala de empresa", client:"Empresa Demo A", rut:"76.000.000-0 · ficticio", kind:"Empresa", date:"2026-12-05", payment:"Crédito 30 días", documentType:33,
    lines:[{name:"Cabina Classic · 3 horas",net:400000},{name:"Álbum de firmas",net:50000},{name:"Traslado comercial",net:35000}], discount:20000, agreedTotal:553350 },
  { id:"QA-EVT-002", name:"Matrimonio de prueba", client:"Cliente Demo B", rut:"Consumidor final", kind:"Particular", date:"2026-12-12", payment:"Transferencia · abono de prueba", documentType:39,
    lines:[{name:"Cabina Polaroid · 2 horas",net:280000},{name:"Imanes",net:20000}], discount:10000, agreedTotal:345100 },
  { id:"QA-EVT-003", name:"Aniversario corporativo", client:"Empresa Demo C", rut:"77.000.000-0 · ficticio", kind:"Empresa", date:"2026-12-18", payment:"Contado", documentType:33,
    lines:[{name:"Black Studio · 4 horas",net:510000},{name:"Traslado comercial",net:40000}], discount:0, agreedTotal:654500 }
];
export const names = {33:"Factura electrónica",39:"Boleta electrónica",61:"Nota de crédito"};
export class InputError extends Error {}
export function preview(eventId, type, original, reason = "") {
  const event = fixtures.find((item) => item.id === eventId);
  if (!event || !names[type]) throw new InputError("Selecciona un evento y documento válidos.");
  if (!Number.isInteger(type)) throw new InputError("Tipo tributario inválido.");
  if (type === 61 && (original?.eventId !== eventId || ![33,39].includes(original?.type) || original?.status !== "ACEPTADO")) {
    throw new InputError("Selecciona una factura o boleta simulada aceptada del mismo evento.");
  }
  if (type !== 61 && event.documentType !== type) throw new InputError("El tipo no coincide con la condición comercial del evento.");
  const creditReason = String(reason).trim();
  if (type === 61 && (creditReason.length < 5 || creditReason.length > 250)) throw new InputError("Ingresa un motivo de 5 a 250 caracteres.");
  const sale = type === 61 ? original.snapshot : event;
  const subtotal = sale.lines.reduce((total, item) => total + item.net, 0);
  const net = subtotal - sale.discount;
  const tax = Math.round(net * 19 / 100);
  const total = net + tax;
  if (net <= 0 || total !== (type === 61 ? sale.total : event.agreedTotal)) throw new InputError("El cálculo no reconcilia con la venta de prueba.");
  const snapshot = {
    eventId, event: event.name, client: sale.client, rut: sale.rut, kind: sale.kind, date: sale.date, payment: sale.payment,
    type, label:names[type], lines:sale.lines, subtotal, discount:sale.discount, net, tax, total,
    reference: type === 61 ? {id:original.id, type:original.type, folio:original.folio, reason:creditReason} : null
  };
  return { ...snapshot, hash:createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}

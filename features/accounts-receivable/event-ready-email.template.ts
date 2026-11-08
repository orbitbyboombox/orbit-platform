/**
 * Premium event-readiness email. Presentation-only: no sending, persistence,
 * booking state transitions or automatic confirmations.
 * Keep the BOOMBOX v2.1.6 visual identity intact.
 */
export type EventReadyEmailInput = {
  customerName: string;
  eventDate: string;
  eventLocation: string;
  service: string;
  eventTime: string;
  eventDuration: string;
};

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

export function buildEventReadyEmail(input: EventReadyEmailInput) {
  const required = Object.values(input);
  if (required.some(value => !value.trim())) {
    throw new Error("Faltan datos confirmados para el correo Todo listo");
  }
  const subject = "¡Todo listo para tu celebración! — BOOMBOX";
  const detail = (label: string, value: string) =>
    `<div style="display:inline-block;vertical-align:top;box-sizing:border-box;width:49%;min-width:230px;padding:10px 12px 10px 0"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase">${escapeHtml(label)}</div><div style="margin-top:5px;font-size:15px;font-weight:600;color:#17191f;overflow-wrap:anywhere">${escapeHtml(value)}</div></div>`;
  const details = [
    ["Fecha", input.eventDate],
    ["Lugar", input.eventLocation],
    ["Horario del servicio", input.eventTime],
    ["Servicio", input.service],
    ["Duración", input.eventDuration],
  ].map(([label, value]) => detail(label, value)).join("");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f7;padding:0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(subject)}</div><main style="width:100%;padding:28px 12px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#17191f"><section style="max-width:620px;margin:0 auto;overflow:hidden;border:1px solid #e3e5e9;border-radius:20px;background:#ffffff;box-shadow:0 16px 42px rgba(17,24,39,.08)"><header style="background:#101216;padding:25px 28px;border-bottom:4px solid #f68b1f"><div style="font-size:22px;font-weight:800;letter-spacing:.08em;color:#ffffff">BOOMBOX</div><div style="margin-top:7px;font-size:12px;letter-spacing:.12em;color:#f6a452;text-transform:uppercase">Todo listo para tu celebración</div></header><div style="padding:28px"><p style="margin:0 0 8px;font-size:18px;font-weight:700;line-height:1.45">Hola ${escapeHtml(input.customerName)},</p><p style="margin:0;font-size:15px;line-height:1.65;color:#5f6470">¡Ya está todo preparado para acompañarte en tu celebración! Te compartimos el resumen de tu servicio BOOMBOX para que podamos revisar los últimos detalles.</p><section style="margin:26px 0;border:1px solid #30343a;border-radius:16px;padding:18px 20px;background:#fafafa"><h2 style="margin:0 0 8px;font-size:11px;letter-spacing:.16em;color:#f07f16;text-transform:uppercase">Detalle del evento</h2><div style="font-size:0">${details}</div></section><section style="margin:26px 0;border-radius:16px;padding:20px 22px;background:#fff9f0"><h2 style="margin:0 0 12px;font-size:11px;letter-spacing:.16em;color:#bf4a00;text-transform:uppercase">Últimas confirmaciones</h2><p style="margin:0 0 10px;font-size:15px;font-weight:700">Confirmar horario del servicio</p><p style="margin:0;font-size:15px;font-weight:700">Confirmar diseño</p><p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#5f6470">Si necesitas ajustar algún detalle, responde directamente a este correo. Este mensaje no modifica tu reserva automáticamente.</p></section><p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:#5f6470">Gracias por confiar en BOOMBOX. ¡Nos vemos en tu evento!</p></div><footer style="border-top:1px solid #eceef2;padding:18px 28px;font-size:11px;line-height:1.6;color:#7a808b">BOOMBOX · Comunicación emitida mediante ORBIT<br>ORBIT · Software desarrollado por BOOMBOX<br><a href="https://www.bbox.cl" style="color:#f07f16;text-decoration:none">www.bbox.cl</a></footer></section></main></body></html>`;
  return { subject, html };
}

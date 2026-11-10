import { renderBoomboxCommercialEmail } from "../connectors/google-gmail/application/boombox-commercial-email.html.ts";

/** Uses the certified BOOMBOX commercial shell shared with reservation and quote emails. */
export type EventReadyEmailInput = {
  customerName: string;
  eventDate: string;
  eventLocation: string;
  service: string;
  eventTime: string;
  eventDuration: string;
  website?: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

export function buildEventReadyEmail(input: EventReadyEmailInput) {
  if (Object.values(input).some((value) => typeof value === "string" && !value.trim())) {
    throw new Error("Faltan datos confirmados para el correo Todo listo");
  }
  const subject = "¡Todo listo para tu celebración! — BOOMBOX";
  const details = [
    ["Fecha", input.eventDate], ["Lugar", input.eventLocation],
    ["Horario del servicio", input.eventTime], ["Servicio", input.service],
    ["Duración", input.eventDuration],
  ].map(([label, value]) => `<tr><td style="padding:9px 12px 9px 0;color:#bfc1c5;font-size:13px;vertical-align:top">${escapeHtml(label)}</td><td align="right" style="padding:9px 0;color:#ffffff;font-size:14px;font-weight:700;vertical-align:top;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join("");
  const contentHtml = `<p style="margin:0 0 18px">Hola ${escapeHtml(input.customerName)},</p><p style="margin:0 0 22px">¡Ya está todo preparado para acompañarte en tu celebración! Revisa el resumen de tu servicio BOOMBOX y confirma los últimos detalles respondiendo a este correo.</p><h2 style="margin:24px 0 12px;color:#f78900;font-size:13px;letter-spacing:.12em">DETALLE DEL EVENTO</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-top:1px solid #454545;border-bottom:1px solid #454545">${details}</table><h2 style="margin:24px 0 10px;color:#f78900;font-size:13px;letter-spacing:.12em">ÚLTIMAS CONFIRMACIONES</h2><p style="margin:0 0 9px"><strong>Confirmar horario del servicio</strong></p><p style="margin:0"><strong>Confirmar diseño</strong></p><p style="margin:18px 0 0;color:#d1d1d1;font-size:13px">Este mensaje no modifica tu reserva automáticamente. Si necesitas ajustar algún dato, responde directamente a este correo.</p><p style="margin:20px 0 0">Gracias por confiar en BOOMBOX. ¡Nos vemos en tu evento!</p>`;
  const html = renderBoomboxCommercialEmail({
    preheader: subject,
    eyebrow: "TODO LISTO PARA TU CELEBRACIÓN",
    title: "Nos vemos muy pronto",
    contentHtml,
    website: input.website?.trim() || "https://www.bbox.cl",
    stackedHeader: true,
    fixedLayout: true,
  });
  return { subject, html };
}

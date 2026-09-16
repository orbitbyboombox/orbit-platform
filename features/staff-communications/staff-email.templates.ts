const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const roleLabels: Record<string, string> = {
  OPERATOR: "Operador",
  ASSEMBLY: "Montaje",
  DISASSEMBLY: "Desmontaje",
  ASSEMBLY_DISASSEMBLY: "Montaje + desmontaje",
  SUPPORT: "Apoyo",
};

const readableRole = (value: string) =>
  roleLabels[value] ?? value.replaceAll("_", " ");
const chileDate = (value: string) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

function premiumFrame(input: {
  appUrl: string;
  preheader: string;
  eyebrow: string;
  title: string;
  content: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  const logo = `${input.appUrl.replace(/\/$/, "")}/branding/ORBIT%20V1-0%20SINFONDO.png`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#efede8"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#efede8"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #ded8ce;border-radius:18px;overflow:hidden"><tr><td style="height:5px;background:#f78900;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:25px 28px;background:#101113;color:#ffffff"><img src="${escapeHtml(logo)}" width="154" alt="BOOMBOX" style="display:block;max-width:154px;height:auto;border:0;color:#ffffff;font:700 18px Arial,sans-serif"><p style="margin:22px 0 0;font:700 11px Arial,sans-serif;letter-spacing:.18em;color:#f78900">${escapeHtml(input.eyebrow.toUpperCase())}</p><h1 style="margin:9px 0 0;font:700 27px/1.18 Arial,sans-serif;color:#ffffff">${escapeHtml(input.title)}</h1></td></tr><tr><td style="padding:30px 28px 32px;font:15px/1.65 Arial,sans-serif;color:#202124">${input.content}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px"><tr><td style="border-radius:11px;background:#f78900"><a href="${escapeHtml(input.ctaHref)}" style="display:inline-block;padding:13px 19px;font:700 14px Arial,sans-serif;color:#111214;text-decoration:none">${escapeHtml(input.ctaLabel)}</a></td></tr></table><p style="margin:30px 0 0;padding-top:18px;border-top:1px solid #ece8e1;font:12px/1.6 Arial,sans-serif;color:#726e67">BOOMBOX · Comunicación emitida mediante ORBIT<br>PRODUCCIONES BOOMBOX COMPANY SPA</p></td></tr></table></td></tr></table></body></html>`;
}

export function buildStaffD1ReminderEmail(input: {
  appUrl: string;
  firstName: string;
  eventName: string;
  eventDate: string;
  roles: string[];
  eventTime?: string | null;
  location?: string | null;
}) {
  const roles =
    [...new Set(input.roles)].map(readableRole).join(" · ") ||
    "Staff operativo";
  const location = input.location?.trim() || "Por confirmar en ORBIT";
  const time = input.eventTime?.slice(0, 5) || "Por confirmar";
  const portal = `${input.appUrl.replace(/\/$/, "")}/staff-portal`;
  const textBody = [
    `Hola ${input.firstName},`,
    "Recuerda que mañana tienes evento BOOMBOX.",
    `Evento: ${input.eventName}`,
    `Fecha: ${chileDate(input.eventDate)}`,
    `Rol(es): ${roles}`,
    `Horario: ${time}`,
    `Punto / dirección: ${location}`,
    `Ver detalle en ORBIT: ${portal}`,
  ].join("\n");
  const content = `<p style="margin:0">Hola ${escapeHtml(input.firstName)},</p><p style="margin:12px 0 0;font-size:18px;font-weight:700;color:#111214">Recuerda que mañana tienes evento BOOMBOX.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:23px;border:1px solid #e8e2d8;border-radius:13px;background:#faf9f6"><tr><td style="padding:18px"><p style="margin:0 0 10px;font-size:17px;font-weight:700">${escapeHtml(input.eventName)}</p><p style="margin:5px 0"><strong>Fecha:</strong> ${escapeHtml(chileDate(input.eventDate))}</p><p style="margin:5px 0"><strong>Rol(es):</strong> ${escapeHtml(roles)}</p><p style="margin:5px 0"><strong>Horario:</strong> ${escapeHtml(time)}</p><p style="margin:5px 0"><strong>Punto / dirección:</strong> ${escapeHtml(location)}</p></td></tr></table>`;
  return {
    subject: `Mañana tienes evento BOOMBOX · ${input.eventName}`,
    textBody,
    htmlBody: premiumFrame({
      appUrl: input.appUrl,
      preheader: "Recuerda que mañana tienes evento BOOMBOX.",
      eyebrow: "Recordatorio operacional · D-1",
      title: "Tu evento es mañana",
      content,
      ctaLabel: "Ver detalle en ORBIT",
      ctaHref: portal,
    }),
  };
}

export function buildMonthlySettlementReadyEmail(input: {
  appUrl: string;
  firstName: string;
  monthLabel: string;
  boletaGross: number;
  finalTransfer: number;
}) {
  const portal = `${input.appUrl.replace(/\/$/, "")}/staff-portal`;
  const textBody = `Hola ${input.firstName},\n\nTu liquidación mensual BOOMBOX de ${input.monthLabel} está lista.\nAdjuntamos el PDF con el detalle.\n\nPor favor emite tu boleta de honorarios por ${money(input.boletaGross)} con estos datos:\nPRODUCCIONES BOOMBOX COMPANY SPA\nRUT 76.565.272-3\nGiro: Publicidad\nPUERTA ORIENTE 361 OF 310 TORRE C\nColina\ncontabilidad@bbox.cl\nDetalle sugerido: EVENTOS BOOMBOX\n\nMonto final a depositar: ${money(input.finalTransfer)}\nSube tu boleta en ORBIT: ${portal}`;
  const content = `<p style="margin:0">Hola ${escapeHtml(input.firstName)},</p><p style="margin:12px 0 0;font-size:18px;font-weight:700">Tu liquidación mensual BOOMBOX está lista.</p><p style="margin:10px 0 0">Adjuntamos el PDF con el detalle de ${escapeHtml(input.monthLabel)}. Por favor emite tu boleta de honorarios por <strong>${escapeHtml(money(input.boletaGross))}</strong>.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border:1px solid #e8e2d8;border-radius:13px;background:#faf9f6"><tr><td style="padding:18px"><p style="margin:0 0 9px;font-size:11px;font-weight:700;letter-spacing:.14em;color:#d76d00">DATOS EMPRESA</p><p style="margin:3px 0;font-weight:700">PRODUCCIONES BOOMBOX COMPANY SPA</p><p style="margin:3px 0">RUT 76.565.272-3 · Giro: Publicidad</p><p style="margin:3px 0">PUERTA ORIENTE 361 OF 310 TORRE C · Colina</p><p style="margin:3px 0">contabilidad@bbox.cl</p><p style="margin:12px 0 0"><strong>Detalle sugerido:</strong> EVENTOS BOOMBOX</p></td></tr></table><p style="margin:18px 0 0"><strong>Monto final a depositar:</strong> ${escapeHtml(money(input.finalTransfer))}</p>`;
  return {
    subject: `Tu liquidación mensual BOOMBOX está lista · ${input.monthLabel}`,
    textBody,
    htmlBody: premiumFrame({
      appUrl: input.appUrl,
      preheader: "Tu liquidación mensual BOOMBOX está lista.",
      eyebrow: "Staff · Liquidación mensual",
      title: "Emite y sube tu boleta",
      content,
      ctaLabel: "Subir boleta en ORBIT",
      ctaHref: portal,
    }),
  };
}

export function buildStaffPaymentCompletedEmail(input: {
  appUrl: string;
  firstName: string;
  monthLabel: string;
  amount: number;
  paidOn: string;
}) {
  const portal = `${input.appUrl.replace(/\/$/, "")}/staff-portal`;
  const textBody = `Hola ${input.firstName},\n\nPAGO REALIZADO\nRegistramos el pago de ${money(input.amount)} correspondiente a ${input.monthLabel}, con fecha ${chileDate(input.paidOn)}.\n\nMuchas gracias por ser parte de nuestra empresa. Esperamos seguir contigo en este nuevo mes que se viene.\n\nVer comprobante en ORBIT: ${portal}`;
  const content = `<p style="margin:0">Hola ${escapeHtml(input.firstName)},</p><p style="margin:13px 0 0">Registramos el pago correspondiente a <strong>${escapeHtml(input.monthLabel)}</strong>.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border:1px solid #e8e2d8;border-radius:13px;background:#faf9f6"><tr><td style="padding:18px"><p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;color:#d76d00">MONTO DEPOSITADO</p><p style="margin:6px 0 0;font-size:27px;font-weight:700;color:#111214">${escapeHtml(money(input.amount))}</p><p style="margin:7px 0 0;color:#68645e">Fecha: ${escapeHtml(chileDate(input.paidOn))}</p></td></tr></table><p style="margin:20px 0 0">Muchas gracias por ser parte de nuestra empresa. Esperamos seguir contigo en este nuevo mes que se viene.</p>`;
  return {
    subject: `PAGO REALIZADO · ${input.monthLabel}`,
    textBody,
    htmlBody: premiumFrame({
      appUrl: input.appUrl,
      preheader: `Pago realizado por ${money(input.amount)}.`,
      eyebrow: "Staff · Pago confirmado",
      title: "PAGO REALIZADO",
      content,
      ctaLabel: "Ver comprobante en ORBIT",
      ctaHref: portal,
    }),
  };
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const chileDate = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const logoUrl = "https://app.bbox.cl/branding/boombox-official-logo.png";

function premiumFrame(input: {
  preheader: string;
  eyebrow: string;
  title: string;
  content: string;
  appUrl: string;
}) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><style>@media only screen and (max-width:520px){.orbit-shell{padding:10px 6px!important}.orbit-card{border-radius:14px!important}.orbit-pad{padding:26px 19px!important}.orbit-header{padding:25px 19px!important}.orbit-title{font-size:25px!important}}</style></head><body style="margin:0;padding:0;background:#08090b;color:#fff"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#08090b">${escapeHtml(input.preheader)}</div><main class="orbit-shell" style="width:100%;box-sizing:border-box;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#fff"><section class="orbit-card" style="max-width:640px;margin:0 auto;overflow:hidden;border:1px solid #333437;border-radius:22px;background:#0e1013;box-shadow:0 20px 60px rgba(0,0,0,.35)"><header class="orbit-header" style="padding:30px 28px;text-align:center;background:#111214;border-top:6px solid #f78900"><img src="${logoUrl}" alt="BOOMBOX®" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:0 auto;border:0"><div style="margin-top:14px;font-size:10px;font-weight:800;letter-spacing:.2em;color:#f78900;text-transform:uppercase">${escapeHtml(input.eyebrow)}</div><h1 class="orbit-title" style="margin:14px 0 0;font-size:30px;line-height:1.1;letter-spacing:-.02em;color:#fff">${escapeHtml(input.title)}</h1></header><div class="orbit-pad" style="padding:32px 28px;color:#d8d8da">${input.content}</div><footer style="border-top:1px solid #343538;padding:20px 28px;font-size:10px;line-height:1.7;letter-spacing:.08em;color:#77787c">BOOMBOX · Comunicación emitida mediante ORBIT<br>ORBIT · Software desarrollado por BOOMBOX<br><a href="${escapeHtml(input.appUrl)}" style="color:#f78900;text-decoration:none">${escapeHtml(input.appUrl.replace(/^https?:\/\//, ""))}</a></footer></section></main></body></html>`;
}

function detailTable(rows: Array<[string, string]>, title = "DETALLES DEL EVENTO") {
  return `<section style="margin:24px 0;border:1px solid #343538;border-radius:16px;padding:20px;background:#15171b"><div style="margin:0 0 14px;font-size:11px;font-weight:800;letter-spacing:.15em;color:#f78900;text-transform:uppercase">${escapeHtml(title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:14px;color:#fff">${rows.map(([label, value]) => `<tr><td style="padding:7px 0;color:#9fa3aa">${escapeHtml(label)}</td><td align="right" style="padding:7px 0;font-weight:700;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join("")}</table></section>`;
}

export type OneDayCustomerReminderInput = {
  appUrl: string;
  customerName: string;
  service: string;
  eventDate: string;
  eventTime: string;
  location: string;
};

export function buildCustomerOneDayReminderEmail(input: OneDayCustomerReminderInput) {
  const date = chileDate(input.eventDate);
  const textBody = [`Hola ${input.customerName},`, "", "¡NOS VEMOS MAÑANA CON TODO!", "", "¡Mañana es el gran día!", "Estamos felices de acompañarte con una experiencia BOOMBOX preparada especialmente para tu evento.", "", "DETALLES DE TU EXPERIENCIA", `Servicio: ${input.service}`, `Fecha: ${date}`, `Horario: ${input.eventTime}`, `Lugar: ${input.location}`, "", "Nuestro equipo está listo para hacer de este momento una gran experiencia.", "", "Nosotros nos encargamos de la experiencia. Tú disfruta el momento.", "", "¡Nos vemos mañana!", "", "BOOMBOX"].join("\n");
  const content = `<p style="margin:0;font-size:18px;font-weight:700;line-height:1.45;color:#fff">Hola ${escapeHtml(input.customerName)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.7;color:#d8d8da">¡Mañana es el gran día!</p><p style="margin:8px 0 0;font-size:15px;line-height:1.7;color:#d8d8da">Estamos felices de acompañarte con una experiencia BOOMBOX preparada especialmente para tu evento.</p>${detailTable([["Servicio", input.service], ["Fecha", date], ["Horario", input.eventTime], ["Lugar", input.location]], "DETALLES DE TU EXPERIENCIA")}<p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#d8d8da">Nuestro equipo está listo para hacer de este momento una gran experiencia.</p><p style="margin:24px 0 0;padding:18px;border-left:3px solid #f78900;background:#21170d;font-size:16px;font-weight:700;line-height:1.6;color:#fff">Nosotros nos encargamos de la experiencia.<br>Tú disfruta el momento.</p><p style="margin:26px 0 0;font-size:18px;font-weight:800;color:#fff">¡Nos vemos mañana!</p><p style="margin:10px 0 0;font-size:14px;color:#c8c9cc"><strong>BOOMBOX</strong></p>`;
  return { subject: "BOOMBOX | ¡Nos vemos mañana con todo!", textBody, htmlBody: premiumFrame({ appUrl: input.appUrl, preheader: "¡Nos vemos mañana con todo!", eyebrow: "Tu experiencia BOOMBOX", title: "¡NOS VEMOS MAÑANA CON TODO!", content }) };
}

export type OneDayStaffReminderInput = {
  appUrl: string;
  firstName: string;
  customerName: string;
  service: string;
  eventDate: string;
  assignmentTime: string;
  location: string;
  role: string;
  extras: string[];
};

export function buildStaffOneDayReminderEmail(input: OneDayStaffReminderInput) {
  const date = chileDate(input.eventDate);
  const extraCopy = input.extras.length ? input.extras.join(" · ") : "Sin elementos adicionales informados.";
  const textBody = [`Hola ${input.firstName},`, "", "TIENES EVENTO MAÑANA", "", "Te recordamos que mañana tienes un evento asignado.", "", "DETALLES DEL EVENTO", `Cliente: ${input.customerName}`, `Servicio: ${input.service}`, `Fecha: ${date}`, `Horario: ${input.assignmentTime}`, `Ubicación: ${input.location}`, `Función: ${input.role}`, "", "RECUERDA", extraCopy, "", "BOOMBOX STAFF"].join("\n");
  const content = `<p style="margin:0;font-size:18px;font-weight:700;line-height:1.45;color:#fff">Hola ${escapeHtml(input.firstName)},</p><p style="margin:14px 0 0;font-size:15px;line-height:1.7;color:#d8d8da">Te recordamos que mañana tienes un evento asignado.</p>${detailTable([["Cliente", input.customerName], ["Servicio", input.service], ["Fecha", date], ["Horario", input.assignmentTime], ["Ubicación", input.location], ["Función", input.role]])}<section style="margin:24px 0;border:1px solid #473522;border-radius:16px;padding:20px;background:#21170d"><div style="font-size:11px;font-weight:800;letter-spacing:.15em;color:#f78900;text-transform:uppercase">RECUERDA</div><p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#e8dfd4">${escapeHtml(extraCopy)}</p></section><p style="margin:26px 0 0;font-size:14px;color:#c8c9cc"><strong>BOOMBOX STAFF</strong></p>`;
  return { subject: "BOOMBOX STAFF | Tienes evento mañana", textBody, htmlBody: premiumFrame({ appUrl: input.appUrl, preheader: "Tienes evento mañana.", eyebrow: "Aviso Staff · 24 horas", title: "TIENES EVENTO MAÑANA", content }) };
}

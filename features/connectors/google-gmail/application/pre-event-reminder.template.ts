import type { CollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";

export const PRE_EVENT_REMINDER_TYPE = "PRE_EVENT_REMINDER";
export const PRE_EVENT_REMINDER_RENDERER_VERSION = "PRE_EVENT_REMINDER_V1";

export type PreEventReminderPayment = {
  projectionId: string;
  outstandingBalance: number;
  dueDate: string | null;
  bankDetails: CollectionBankDetails;
};

export type PreEventReminderModel = {
  customerName: string;
  eventDate: string;
  operatorArrivalAt: string | null;
  assemblyStartAt: string | null;
  scrapbookIncluded: boolean;
  photoDesignPending: boolean;
  payment: PreEventReminderPayment | null;
  website: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function formatPreEventDate(value: string) {
  const candidate = value.trim().slice(0, 10);
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(candidate);
  if (!parts) throw new Error("El Evento no tiene una fecha canónica válida.");
  const [, year, month, day] = parts;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  if (date.toISOString().slice(0, 10) !== candidate) {
    throw new Error("El Evento no tiene una fecha canónica válida.");
  }
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatPreEventCurrency(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("El saldo canónico del Evento no es válido.");
  }
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPreEventTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Santiago",
  }).format(date);
}

export function defaultPreEventReminderSubject(eventDate: string) {
  return `Todo listo para tu evento BOOMBOX · ${formatPreEventDate(eventDate)}`;
}

export function daysUntilPreEvent(eventDate: string, now = new Date()) {
  const canonicalDate = eventDate.trim().slice(0, 10);
  formatPreEventDate(canonicalDate);
  const currentParts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    currentParts.find((item) => item.type === type)?.value ?? "";
  const currentDate = `${part("year")}-${part("month")}-${part("day")}`;
  const eventUtc = Date.parse(`${canonicalDate}T12:00:00Z`);
  const currentUtc = Date.parse(`${currentDate}T12:00:00Z`);
  return Math.round((eventUtc - currentUtc) / 86_400_000);
}

export function normalizePreEventSubject(value: string, fallback: string) {
  const subject = value.trim() || fallback;
  if (/[\r\n]/.test(subject) || subject.length > 180) {
    throw new Error("El asunto del recordatorio no es válido.");
  }
  return subject;
}

export function preEventReminderFingerprint(model: PreEventReminderModel) {
  return JSON.stringify({
    rendererVersion: PRE_EVENT_REMINDER_RENDERER_VERSION,
    customerName: model.customerName,
    eventDate: model.eventDate,
    operatorArrivalAt: model.operatorArrivalAt,
    assemblyStartAt: model.assemblyStartAt,
    scrapbookIncluded: model.scrapbookIncluded,
    photoDesignPending: model.photoDesignPending,
    payment: model.payment
      ? {
          projectionId: model.payment.projectionId,
          outstandingBalance: model.payment.outstandingBalance,
          dueDate: model.payment.dueDate,
          bankDetails: model.payment.bankDetails,
        }
      : null,
    website: model.website,
  });
}

function operatorCopy(model: PreEventReminderModel) {
  const time = formatPreEventTime(model.operatorArrivalAt);
  return time
    ? `Nuestro operador llegará a las ${time} para realizar las pruebas necesarias antes del servicio.`
    : "Nuestro operador llegará aproximadamente 1 hora antes del inicio del servicio para realizar las pruebas necesarias.";
}

function assemblyCopy(model: PreEventReminderModel) {
  const time = formatPreEventTime(model.assemblyStartAt);
  return time
    ? `Nuestro equipo de montaje comenzará la instalación a las ${time}.`
    : "Nuestro equipo de montaje coordinará la instalación aproximadamente 2 horas antes del inicio del servicio.";
}

export function buildPreEventReminderText(model: PreEventReminderModel) {
  const eventDate = formatPreEventDate(model.eventDate);
  const lines = [
    `Hola ${model.customerName.trim() || "Cliente"},`,
    "",
    `Ya está todo coordinado para tu evento del ${eventDate}.`,
    "Nuestro equipo BOOMBOX está preparando los últimos detalles para que el servicio comience puntualmente y todo funcione a la perfección.",
    "",
    "TODO COORDINADO",
    "OPERADOR BOOMBOX",
    operatorCopy(model),
    "",
    "MONTAJE",
    assemblyCopy(model),
    "",
    "PARA QUE TODO FUNCIONE PERFECTO",
    "Necesitamos disponer de un enchufe 220V independiente a un máximo de 1,5 m del tótem.",
    "Evita conectar el equipo a múltiples alargadores o zapatillas compartidas.",
  ];
  if (model.scrapbookIncluded) {
    lines.push(
      "",
      "TU SCRAPBOOK",
      "Recuerda disponer de una mesa junto al tótem para que tus invitados puedan dejar sus mensajes.",
      "Al finalizar el servicio, nuestro operador hará entrega del Scrapbook directamente al responsable del evento.",
    );
  }
  if (model.photoDesignPending) {
    lines.push(
      "",
      "DISEÑO DE TUS FOTOS",
      "Aún necesitamos confirmar el diseño/formato de foto de tu evento.",
      "Por favor, responde a este email para coordinarlo con nuestro equipo.",
    );
  }
  if (model.payment) {
    lines.push(
      "",
      "SALDO PENDIENTE",
      `Saldo por pagar: ${formatPreEventCurrency(model.payment.outstandingBalance)}`,
      `Fecha de vencimiento: ${model.payment.dueDate ? formatPreEventDate(model.payment.dueDate) : "Por confirmar"}`,
      "Antes del evento, recuerda dejar regularizado el saldo pendiente.",
      "Si ya realizaste el pago recientemente, puedes ignorar este recordatorio.",
      "",
      "DATOS PARA TRANSFERENCIA",
      model.payment.bankDetails.companyLabel,
      `Banco: ${model.payment.bankDetails.bankName}`,
      `Tipo de cuenta: ${model.payment.bankDetails.accountType}`,
      `N° de cuenta: ${model.payment.bankDetails.accountNumber}`,
      `RUT: ${model.payment.bankDetails.rut}`,
      `Comprobante: ${model.payment.bankDetails.email}`,
    );
  }
  lines.push(
    "",
    "Nos vemos muy pronto.",
    "Gracias por confiar en BOOMBOX para ser parte de tu evento.",
    "",
    "Equipo BOOMBOX",
  );
  return lines.join("\n");
}

export function renderPreEventReminderHtml(
  model: PreEventReminderModel,
  suppliedSubject?: string,
) {
  const subject = normalizePreEventSubject(
    suppliedSubject ?? "",
    defaultPreEventReminderSubject(model.eventDate),
  );
  const customer = escapeHtml(model.customerName.trim() || "Cliente");
  const eventDate = escapeHtml(formatPreEventDate(model.eventDate));
  const operator = escapeHtml(operatorCopy(model));
  const assembly = escapeHtml(assemblyCopy(model));
  const website = /^https:\/\//i.test(model.website.trim())
    ? model.website.trim()
    : "https://www.bbox.cl";
  const sectionTitle = (title: string) =>
    `<h2 style="margin:0 0 14px;font-size:11px;font-weight:800;letter-spacing:.15em;color:#d85f00;text-transform:uppercase">${escapeHtml(title)}</h2>`;
  const operationalItem = (title: string, copy: string) =>
    `<div style="margin-top:14px;border-left:3px solid #f07f16;padding-left:14px"><div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#17191f;text-transform:uppercase">${escapeHtml(title)}</div><p style="margin:5px 0 0;font-size:14px;line-height:1.6;color:#454a54">${copy}</p></div>`;
  const scrapbook = model.scrapbookIncluded
    ? `<section style="margin:24px 0;border:1px solid #f1c99f;border-radius:16px;padding:20px;background:#fff9f2">${sectionTitle("Tu Scrapbook")}<p style="margin:0;font-size:14px;line-height:1.6;color:#333740">Recuerda disponer de una mesa junto al tótem para que tus invitados puedan dejar sus mensajes.</p><p style="margin:9px 0 0;font-size:14px;line-height:1.6;color:#333740">Al finalizar el servicio, nuestro operador hará entrega del Scrapbook directamente al responsable del evento.</p></section>`
    : "";
  const photoDesign = model.photoDesignPending
    ? `<section style="margin:24px 0;border:1px solid #f1c99f;border-radius:16px;padding:20px;background:#fff9f2">${sectionTitle("Diseño de tus fotos")}<p style="margin:0;font-size:14px;line-height:1.6;color:#333740">Aún necesitamos confirmar el diseño/formato de foto de tu evento.</p><p style="margin:9px 0 0;font-size:14px;line-height:1.6;color:#333740">Por favor, responde a este email para coordinarlo con nuestro equipo.</p></section>`
    : "";
  const payment = model.payment
    ? (() => {
        const details = model.payment.bankDetails;
        const dueDate = model.payment.dueDate
          ? formatPreEventDate(model.payment.dueDate)
          : "Por confirmar";
        const bankRow = (label: string, value: string) =>
          `<div style="border-top:1px solid #343840;padding:10px 0"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#aeb4bf;text-transform:uppercase">${escapeHtml(label)}</div><div style="margin-top:4px;font-size:14px;font-weight:600;line-height:1.45;color:#ffffff;overflow-wrap:anywhere">${escapeHtml(value)}</div></div>`;
        return `<section style="margin:28px 0 0;border:1px solid #30343a;border-radius:16px;overflow:hidden"><div style="padding:21px 22px;background:#fff9f0"><div style="font-size:11px;font-weight:800;letter-spacing:.15em;color:#bf4a00;text-transform:uppercase">Saldo pendiente</div><div style="margin-top:9px;font-size:30px;font-weight:800;line-height:1.15;color:#090a0c;overflow-wrap:anywhere">${escapeHtml(formatPreEventCurrency(model.payment.outstandingBalance))}</div><div style="margin-top:10px;font-size:13px;font-weight:600;color:#5f6470">Fecha de vencimiento: ${escapeHtml(dueDate)}</div><p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#454a54">Antes del evento, recuerda dejar regularizado el saldo pendiente. Si ya realizaste el pago recientemente, puedes ignorar este recordatorio.</p></div><div style="padding:20px 22px;background:#101216;color:#ffffff">${sectionTitle("Datos para transferencia")}<p style="margin:0 0 10px;font-size:14px;font-weight:700;line-height:1.5;color:#ffffff">${escapeHtml(details.companyLabel)}</p>${bankRow("Banco", details.bankName)}${bankRow("Tipo de cuenta", details.accountType)}${bankRow("N° de cuenta", details.accountNumber)}${bankRow("RUT", details.rut)}${bankRow("Enviar comprobante a", details.email)}</div></section>`;
      })()
    : "";

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><style>@media only screen and (max-width:480px){.orbit-shell{padding:14px 8px!important}.orbit-card{border-radius:14px!important}.orbit-pad{padding:22px 18px!important}.orbit-header{padding:22px 20px!important}}</style></head><body style="margin:0;background:#f4f5f7;padding:0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(subject)} · Nos vemos muy pronto.</div><main class="orbit-shell" style="width:100%;padding:28px 12px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#17191f"><section class="orbit-card" style="max-width:620px;margin:0 auto;overflow:hidden;border:1px solid #e3e5e9;border-radius:20px;background:#ffffff;box-shadow:0 16px 42px rgba(17,24,39,.08)"><header class="orbit-header" style="background:#101216;padding:26px 28px;border-bottom:4px solid #f68b1f"><div style="font-size:22px;font-weight:800;letter-spacing:.08em;color:#ffffff">BOOMBOX</div><div style="margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.15em;color:#f6a452;text-transform:uppercase">Nos vemos muy pronto</div><div style="margin-top:13px;font-size:24px;font-weight:800;line-height:1.2;color:#ffffff">Todo listo para tu evento</div></header><div class="orbit-pad" style="padding:30px 28px"><p style="margin:0 0 16px;font-size:18px;font-weight:700;line-height:1.45;color:#17191f">Hola ${customer},</p><p style="margin:0 0 11px;font-size:15px;line-height:1.65;color:#333740">Ya está todo coordinado para tu evento del <strong>${eventDate}</strong>.</p><p style="margin:0;font-size:15px;line-height:1.65;color:#333740">Nuestro equipo BOOMBOX está preparando los últimos detalles para que el servicio comience puntualmente y todo funcione a la perfección.</p><section style="margin:26px 0;border:1px solid #e3e5e9;border-radius:16px;padding:20px;background:#fafafa">${sectionTitle("Todo coordinado")}${operationalItem("Operador BOOMBOX", operator)}${operationalItem("Montaje", assembly)}</section><section style="margin:24px 0;border:1px solid #f1c99f;border-radius:16px;padding:20px;background:#fff9f2">${sectionTitle("Para que todo funcione perfecto")}<p style="margin:0;font-size:14px;line-height:1.6;color:#333740">Necesitamos disponer de un <strong>enchufe 220V independiente</strong> a un máximo de <strong>1,5 m del tótem</strong>.</p><p style="margin:9px 0 0;font-size:14px;line-height:1.6;color:#333740">Evita conectar el equipo a múltiples alargadores o zapatillas compartidas.</p></section>${scrapbook}${photoDesign}${payment}<section style="margin:28px 0 0;border-top:1px solid #eceef2;padding-top:22px"><p style="margin:0;font-size:17px;font-weight:700;line-height:1.5;color:#17191f">Nos vemos muy pronto.</p><p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#454a54">Gracias por confiar en BOOMBOX para ser parte de tu evento.</p><p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#333740"><strong>Equipo BOOMBOX</strong></p></section></div><footer style="border-top:1px solid #eceef2;padding:18px 28px;font-size:11px;line-height:1.6;color:#7a808b">BOOMBOX · Comunicación emitida mediante ORBIT<br>ORBIT · Software desarrollado por BOOMBOX<br><a href="${escapeHtml(website)}" style="color:#f07f16;text-decoration:none">${escapeHtml(website.replace(/^https?:\/\//, ""))}</a></footer></section></main></body></html>`;
}

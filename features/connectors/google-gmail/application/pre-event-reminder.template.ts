import type { CollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";

export const PRE_EVENT_REMINDER_TYPE = "PRE_EVENT_REMINDER";
export const PRE_EVENT_REMINDER_RENDERER_VERSION = "PRE_EVENT_REMINDER_V1";

export type PreEventReminderPayment = {
  projectionId: string;
  outstandingBalance: number;
  dueDate: string | null;
  customerType: string | null;
  bankDetails: CollectionBankDetails;
};

export type PreEventReminderModel = {
  customerName: string;
  eventName: string;
  eventDate: string;
  daysUntilEvent: number;
  eventLocation: string;
  serviceStartAt: string | null;
  operatorArrivalAt: string | null;
  assemblyStartAt: string | null;
  reservationConfirmed: boolean;
  scrapbookIncluded: boolean;
  photoDesignRequired: boolean;
  photoDesignApproved: boolean;
  photoDesignPending: boolean;
  payment: PreEventReminderPayment | null;
  bankCopyUrl: string | null;
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
  return `¡Queda muy poco para tu evento! · BOOMBOX · ${formatPreEventDate(eventDate)}`;
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
    eventName: model.eventName,
    eventDate: model.eventDate,
    daysUntilEvent: model.daysUntilEvent,
    eventLocation: model.eventLocation,
    serviceStartAt: model.serviceStartAt,
    operatorArrivalAt: model.operatorArrivalAt,
    assemblyStartAt: model.assemblyStartAt,
    reservationConfirmed: model.reservationConfirmed,
    scrapbookIncluded: model.scrapbookIncluded,
    photoDesignRequired: model.photoDesignRequired,
    photoDesignApproved: model.photoDesignApproved,
    photoDesignPending: model.photoDesignPending,
    bankCopyUrl: model.bankCopyUrl,
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
  const serviceTime = formatPreEventTime(model.serviceStartAt);
  const daysCopy =
    model.daysUntilEvent === 10
      ? "Estamos a solo 10 días de tu evento."
      : model.daysUntilEvent > 1
        ? `Estamos a solo ${model.daysUntilEvent} días de tu evento.`
        : model.daysUntilEvent === 1
          ? "Tu evento es mañana."
          : "Tu evento está muy cerca.";
  const lines = [
    `Hola ${model.customerName.trim() || "Cliente"},`,
    "",
    "¡QUEDA MUY POCO PARA TU EVENTO!",
    daysCopy,
    "Nuestro equipo BOOMBOX ya está preparando los últimos detalles.",
    "",
    "RESUMEN DE TU EVENTO",
    `Evento: ${model.eventName}`,
    `Fecha: ${eventDate}`,
    `Horario: ${serviceTime ?? "Por confirmar"}`,
    `Lugar: ${model.eventLocation || "Por confirmar"}`,
    `Reserva: ${model.reservationConfirmed ? "CONFIRMADA" : "REQUIERE REVISIÓN"}`,
  ];
  if (model.photoDesignRequired) {
    lines.push(
      `Diseño: ${model.photoDesignApproved ? "APROBADO" : "PENDIENTE DE CONFIRMACIÓN"}`,
    );
  }
  if (model.payment) {
    lines.push(
      `Pago: ${formatPreEventCurrency(model.payment.outstandingBalance)} pendiente`,
    );
  } else {
    lines.push("Pago: AL DÍA");
  }
  lines.push(
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
  );
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
    const corporate = String(model.payment.customerType ?? "").toUpperCase() === "CORPORATE";
    lines.push(
      "",
      corporate ? "ESTADO DE PAGO" : "SEGUNDO PAGO / SALDO FINAL",
      `Saldo por pagar: ${formatPreEventCurrency(model.payment.outstandingBalance)}`,
      `Fecha de vencimiento: ${model.payment.dueDate ? formatPreEventDate(model.payment.dueDate) : "Por confirmar"}`,
      corporate
        ? "Revisa este saldo según la condición comercial acordada."
        : "Antes del evento, recuerda dejar regularizado el saldo final.",
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
  const serviceTime = escapeHtml(formatPreEventTime(model.serviceStartAt) ?? "Por confirmar");
  const location = escapeHtml(model.eventLocation || "Por confirmar");
  const operator = escapeHtml(operatorCopy(model));
  const assembly = escapeHtml(assemblyCopy(model));
  const website = /^https:\/\//i.test(model.website.trim())
    ? model.website.trim()
    : "https://www.bbox.cl";
  const sectionTitle = (title: string) =>
    `<h2 style="margin:0 0 14px;font-size:11px;font-weight:800;letter-spacing:.15em;color:#f78900;text-transform:uppercase">${escapeHtml(title)}</h2>`;
  const operationalItem = (title: string, copy: string) =>
    `<div style="margin-top:14px;border-left:3px solid #f78900;padding-left:14px"><div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#ffffff;text-transform:uppercase">${escapeHtml(title)}</div><p style="margin:5px 0 0;font-size:14px;line-height:1.6;color:#d7d8da">${copy}</p></div>`;
  const statusCard = (label: string, value: string, ok: boolean) =>
    `<td width="33.33%" style="padding:8px;vertical-align:top"><div style="min-height:88px;border:1px solid #343538;border-radius:14px;padding:14px;background:#15171b"><div style="font-size:9px;font-weight:800;letter-spacing:.12em;color:#9fa3aa;text-transform:uppercase">${escapeHtml(label)}</div><div style="margin-top:8px;font-size:13px;font-weight:800;line-height:1.35;color:${ok ? "#7ee2a8" : "#f7a85a"}">${escapeHtml(value)}</div></div></td>`;

  const designStatus = !model.photoDesignRequired
    ? "NO REQUERIDO"
    : model.photoDesignApproved
      ? "✓ APROBADO"
      : "PENDIENTE";
  const paymentStatus = model.payment
    ? formatPreEventCurrency(model.payment.outstandingBalance)
    : "✓ AL DÍA";
  const summary = `
    <section style="margin:24px 0 0">
      ${sectionTitle("Estado de tu evento")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed"><tr>
        ${statusCard("Reserva", model.reservationConfirmed ? "✓ CONFIRMADA" : "REVISAR", model.reservationConfirmed)}
        ${statusCard("Diseño", designStatus, !model.photoDesignRequired || model.photoDesignApproved)}
        ${statusCard("Pago", paymentStatus, !model.payment)}
      </tr></table>
    </section>
    <section style="margin:20px 0;border:1px solid #343538;border-radius:16px;padding:18px;background:#15171b">
      ${sectionTitle("Información del evento")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:14px;color:#fff">
        <tr><td style="padding:7px 0;color:#9fa3aa">Evento</td><td align="right" style="padding:7px 0;font-weight:700">${escapeHtml(model.eventName)}</td></tr>
        <tr><td style="padding:7px 0;color:#9fa3aa">Fecha</td><td align="right" style="padding:7px 0;font-weight:700">${eventDate}</td></tr>
        <tr><td style="padding:7px 0;color:#9fa3aa">Horario</td><td align="right" style="padding:7px 0;font-weight:700">${serviceTime}</td></tr>
        <tr><td style="padding:7px 0;color:#9fa3aa">Lugar</td><td align="right" style="padding:7px 0;font-weight:700;overflow-wrap:anywhere">${location}</td></tr>
      </table>
    </section>`;

  const scrapbook = model.scrapbookIncluded
    ? `<section style="margin:24px 0;border:1px solid #473522;border-radius:16px;padding:20px;background:#1b1712">${sectionTitle("Tu Scrapbook")}<p style="margin:0;font-size:14px;line-height:1.6;color:#e6ded4">Recuerda disponer de una mesa junto al tótem para que tus invitados puedan dejar sus mensajes.</p><p style="margin:9px 0 0;font-size:14px;line-height:1.6;color:#e6ded4">Al finalizar el servicio, nuestro operador hará entrega del Scrapbook directamente al responsable del evento.</p></section>`
    : "";
  const photoDesign = model.photoDesignPending
    ? `<section style="margin:24px 0;border:1px solid #f78900;border-radius:16px;padding:20px;background:#21170d">${sectionTitle("Diseño de tus fotos")}<p style="margin:0;font-size:14px;line-height:1.6;color:#fff">Aún necesitamos confirmar el diseño/formato de foto de tu evento.</p><p style="margin:9px 0 0;font-size:14px;line-height:1.6;color:#ddd">Responde este email y nuestro equipo lo coordinará contigo.</p></section>`
    : "";
  const payment = model.payment
    ? (() => {
        const details = model.payment.bankDetails;
        const dueDate = model.payment.dueDate
          ? formatPreEventDate(model.payment.dueDate)
          : "Por confirmar";
        const corporate = String(model.payment.customerType ?? "").toUpperCase() === "CORPORATE";
        const bankRow = (label: string, value: string) =>
          `<div style="border-top:1px solid #343840;padding:10px 0"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#aeb4bf;text-transform:uppercase">${escapeHtml(label)}</div><div style="margin-top:4px;font-size:14px;font-weight:600;line-height:1.45;color:#ffffff;overflow-wrap:anywhere">${escapeHtml(value)}</div></div>`;
        const copyButton = model.bankCopyUrl
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0"><tr><td style="border-radius:12px;background:#f78900"><a href="${escapeHtml(model.bankCopyUrl)}" style="display:inline-block;padding:14px 22px;color:#111214;text-decoration:none;font-size:13px;font-weight:800;letter-spacing:.04em">COPIAR DATOS BANCARIOS</a></td></tr></table><p style="margin:10px 0 0;text-align:center;font-size:11px;color:#8f949d">Se abrirá una página segura de BOOMBOX para copiar todos los datos de una vez.</p>`
          : "";
        return `<section style="margin:28px 0 0;border:1px solid #473522;border-radius:16px;overflow:hidden"><div style="padding:21px 22px;background:#21170d"><div style="font-size:11px;font-weight:800;letter-spacing:.15em;color:#f78900;text-transform:uppercase">${corporate ? "Estado de pago" : "Segundo pago / saldo final"}</div><div style="margin-top:9px;font-size:30px;font-weight:800;line-height:1.15;color:#ffffff;overflow-wrap:anywhere">${escapeHtml(formatPreEventCurrency(model.payment.outstandingBalance))}</div><div style="margin-top:10px;font-size:13px;font-weight:600;color:#c9c0b6">Fecha de vencimiento: ${escapeHtml(dueDate)}</div><p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#e8dfd4">${corporate ? "Revisa este saldo según la condición comercial acordada." : "Antes del evento, recuerda dejar regularizado el saldo final."} Si ya realizaste el pago recientemente, puedes ignorar este recordatorio.</p></div><div style="padding:20px 22px;background:#101216;color:#ffffff">${sectionTitle("Datos para transferencia")}<p style="margin:0 0 10px;font-size:14px;font-weight:700;line-height:1.5;color:#ffffff">${escapeHtml(details.companyLabel)}</p>${bankRow("Banco", details.bankName)}${bankRow("Tipo de cuenta", details.accountType)}${bankRow("N° de cuenta", details.accountNumber)}${bankRow("RUT", details.rut)}${bankRow("Enviar comprobante a", details.email)}${copyButton}</div></section>`;
      })()
    : "";

  const daysCopy =
    model.daysUntilEvent === 10
      ? "Estamos a solo 10 días de tu evento."
      : model.daysUntilEvent > 1
        ? `Estamos a solo ${model.daysUntilEvent} días de tu evento.`
        : model.daysUntilEvent === 1
          ? "Tu evento es mañana."
          : "Tu evento está muy cerca.";

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><style>@media only screen and (max-width:480px){.orbit-shell{padding:10px 6px!important}.orbit-card{border-radius:14px!important}.orbit-pad{padding:28px 20px!important}.orbit-header{padding:26px 20px!important}.orbit-header h1{font-size:27px!important;line-height:1.14!important}.orbit-pad p{line-height:1.72!important}.orbit-pad section{margin-top:26px!important;margin-bottom:26px!important}.orbit-pad table{max-width:100%!important}.orbit-pad a{max-width:100%!important;box-sizing:border-box!important}}</style></head><body style="margin:0;background:#08090b;padding:0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(subject)} · ${escapeHtml(daysCopy)}</div><main class="orbit-shell" style="width:100%;padding:28px 12px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#fff"><section class="orbit-card" style="max-width:640px;margin:0 auto;overflow:hidden;border:1px solid #333437;border-radius:22px;background:#0e1013;box-shadow:0 20px 60px rgba(0,0,0,.35)"><header class="orbit-header" style="background:#111214;padding:30px 28px;border-top:6px solid #f78900;text-align:center"><img src="https://app.bbox.cl/branding/boombox-official-logo.png" alt="BOOMBOX®" width="240" style="display:block;width:240px;max-width:100%;height:auto;margin:0 auto;border:0"><div style="margin-top:14px;font-size:10px;font-weight:800;letter-spacing:.2em;color:#f78900;text-transform:uppercase">NOS VEMOS MUY PRONTO</div><h1 style="margin:14px 0 0;font-size:30px;line-height:1.1;letter-spacing:-.02em;color:#fff">¡QUEDA MUY POCO PARA TU EVENTO!</h1></header><div class="orbit-pad" style="padding:32px 28px"><p style="margin:0 0 14px;font-size:18px;font-weight:700;line-height:1.45;color:#fff">Hola ${customer},</p><p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#d8d8da">${escapeHtml(daysCopy)}</p><p style="margin:0;font-size:15px;line-height:1.65;color:#d8d8da">Nuestro equipo BOOMBOX ya está preparando los últimos detalles para que todo salga perfecto.</p>${summary}<section style="margin:24px 0;border:1px solid #343538;border-radius:16px;padding:20px;background:#15171b">${sectionTitle("Todo coordinado")}${operationalItem("Operador BOOMBOX", operator)}${operationalItem("Montaje", assembly)}</section><section style="margin:24px 0;border:1px solid #473522;border-radius:16px;padding:20px;background:#1b1712">${sectionTitle("Para que todo funcione perfecto")}<p style="margin:0;font-size:14px;line-height:1.6;color:#e6ded4">Necesitamos disponer de un <strong style="color:#fff">enchufe 220V independiente</strong> a un máximo de <strong style="color:#fff">1,5 m del tótem</strong>.</p><p style="margin:9px 0 0;font-size:14px;line-height:1.6;color:#e6ded4">Evita conectar el equipo a múltiples alargadores o zapatillas compartidas.</p></section>${scrapbook}${photoDesign}${payment}<section style="margin:30px 0 0;border-top:1px solid #343538;padding-top:22px"><p style="margin:0;font-size:18px;font-weight:800;line-height:1.5;color:#fff">Nos vemos muy pronto.</p><p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#c8c9cc">Gracias por confiar en BOOMBOX para ser parte de tu evento.</p><p style="margin:18px 0 0;font-size:14px;line-height:1.55;color:#fff"><strong>Equipo BOOMBOX</strong></p></section></div><footer style="border-top:1px solid #343538;padding:20px 28px;font-size:10px;line-height:1.7;letter-spacing:.08em;color:#77787c">BOOMBOX · Comunicación emitida mediante ORBIT<br>ORBIT · Software desarrollado por BOOMBOX<br><a href="${escapeHtml(website)}" style="color:#f78900;text-decoration:none">${escapeHtml(website.replace(/^https?:\/\//, ""))}</a></footer></section></main></body></html>`;
}

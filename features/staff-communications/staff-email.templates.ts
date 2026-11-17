import {
  calculateStaffCallAt,
  chileLocalToIso,
} from "../operations/event-operational-window.ts";

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

const formatClockTime = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{1,2}:\d{2}/.test(trimmed)) {
    const [, hour, minute] = trimmed.match(/^(\d{1,2}):(\d{2})/) ?? [];
    return hour && minute ? `${hour.padStart(2, "0")}:${minute} hrs.` : null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: "hour" | "minute") =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")} hrs.`;
};

/** Formats persisted ISO calls and legacy clock values without leaking the date. */
export const formatStaffCallTime = (
  value: string | null | undefined,
): string | null =>
  value
    ?.split(" · ")
    .map(formatClockTime)
    .filter((item): item is string => Boolean(item))
    .join(" · ") || null;

const defaultOperatorCallTime = (
  eventDate: string,
  eventTime: string | null | undefined,
) => {
  const time = eventTime?.slice(0, 5);
  if (!time) return null;
  try {
    return formatStaffCallTime(
      calculateStaffCallAt(chileLocalToIso(`${eventDate}T${time}:00`)),
    );
  } catch {
    return null;
  }
};

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

const STAFF_EMAIL_LOGO_URL =
  "https://app.bbox.cl/branding/boombox-logo-official-white-email.png";

function premiumFrame(input: {
  appUrl: string;
  preheader: string;
  eyebrow: string;
  title: string;
  content: string;
  ctaLabel: string;
  ctaHref: string;
  showOfficialWhiteLogo?: boolean;
}) {
  // The finance notices use the approved white BOOMBOX® master; other
  // existing staff emails keep their established text logo.
  const logo = input.showOfficialWhiteLogo
    ? `<table role="presentation" align="center" width="220" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:220px;margin:0 auto"><tr><td align="center"><img src="${STAFF_EMAIL_LOGO_URL}" alt="BOOMBOX®" width="220" height="50" style="display:block;width:220px;max-width:100%;height:auto;border:0;margin:0 auto"></td></tr></table>`
    : '<div role="img" aria-label="BOOMBOX" style="font:900 29px/1 Arial,sans-serif;letter-spacing:-1px;color:#ffffff">BOOMBOX<span style="font-size:11px;vertical-align:top">&reg;</span></div>';
  const headerAlign = input.showOfficialWhiteLogo ? "center" : "left";
  const headerTextAlign = input.showOfficialWhiteLogo ? "text-align:center;" : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#efede8"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#efede8"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #ded8ce;border-radius:18px;overflow:hidden"><tr><td style="height:5px;background:#f78900;font-size:0;line-height:0">&nbsp;</td></tr><tr><td align="${headerAlign}" bgcolor="#101113" style="padding:25px 28px;background:#101113;color:#ffffff"><div style="${headerTextAlign}">${logo}<p style="margin:22px 0 0;font:700 11px Arial,sans-serif;letter-spacing:.18em;color:#f78900">${escapeHtml(input.eyebrow.toUpperCase())}</p><h1 style="margin:9px 0 0;font:700 27px/1.18 Arial,sans-serif;color:#ffffff">${escapeHtml(input.title)}</h1></div></td></tr><tr><td style="padding:30px 28px 32px;font:15px/1.65 Arial,sans-serif;color:#202124">${input.content}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:25px"><tr><td style="border-radius:11px;background:#f78900"><a href="${escapeHtml(input.ctaHref)}" style="display:inline-block;padding:13px 19px;font:700 14px Arial,sans-serif;color:#111214;text-decoration:none">${escapeHtml(input.ctaLabel)}</a></td></tr></table><p style="margin:30px 0 0;padding-top:18px;border-top:1px solid #ece8e1;font:12px/1.6 Arial,sans-serif;color:#726e67">BOOMBOX · Comunicación emitida mediante ORBIT<br>PRODUCCIONES BOOMBOX COMPANY SPA</p></td></tr></table></td></tr></table></body></html>`;
}

export function buildStaffD1ReminderEmail(input: {
  appUrl: string;
  firstName: string;
  eventName: string;
  eventDate: string;
  roles: string[];
  eventTime?: string | null;
  location?: string | null;
  customerName?: string | null;
  service?: string | null;
  staffCallAt?: string | null;
  instructions?: string | null;
  specialElements?: readonly string[];
  consolidatedRoutes?: readonly {
    eventName: string;
    customerName: string | null;
    service: string | null;
    boxCode: string | null;
    location: string | null;
    role: string;
    scheduleAt: string | null;
    instructions: string | null;
    specialElements: readonly string[];
  }[];
}) {
  const roles =
    [...new Set(input.roles)].map(readableRole).join(" · ") ||
    "Staff operativo";
  const location = input.location?.trim();
  const time = input.eventTime?.slice(0, 5);
  const persistedCallTime = formatStaffCallTime(input.staffCallAt);
  const callTime =
    persistedCallTime ??
    (input.roles.some((role) => role === "OPERATOR")
      ? defaultOperatorCallTime(input.eventDate, input.eventTime)
      : null);
  const detail = (label: string, value: string | null | undefined) =>
    value?.trim()
      ? `<p style="margin:5px 0"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value.trim())}</p>`
      : "";
  const instructions = input.instructions?.trim();
  const specialElements = [...new Set(input.specialElements ?? [])].filter(
    (item) => item.trim(),
  );
  const portal = `${input.appUrl.replace(/\/$/, "")}/staff-portal`;
  const routeLabel = (role: string) =>
    role === "ASSEMBLY"
      ? "MONTAJE"
      : role === "DISASSEMBLY"
        ? "DESMONTAJE"
        : "OPERACIÓN";
  const routes = (input.consolidatedRoutes ?? []).map((route) => ({
    ...route,
    label: routeLabel(route.role),
    schedule: route.scheduleAt
      ? formatStaffCallTime(route.scheduleAt)
      : route.role === "ASSEMBLY"
        ? "Coordinar con Matías"
        : "Horario a confirmar",
  }));
  const routeText = routes.length
    ? [
        "RUTAS DEL DÍA SIGUIENTE",
        ...routes.map((route) =>
          [
            route.label,
            `Evento: ${route.eventName}${route.customerName ? ` · ${route.customerName}` : ""}`,
            `Dirección: ${route.location ?? "Por confirmar"}`,
            `Servicio: ${route.service ?? "Por confirmar"}`,
            `Caja: ${route.boxCode ?? "Caja no asignada"}`,
            `${route.role === "DISASSEMBLY" ? "Horario de desmontaje" : "Horario de montaje"}: ${route.schedule}`,
            route.instructions?.trim()
              ? `Observaciones: ${route.instructions.trim()}`
              : null,
            route.specialElements.length
              ? `Elementos: ${route.specialElements.join(", ")}`
              : null,
          ]
            .filter((item): item is string => Boolean(item))
            .join("\n"),
        ),
      ].join("\n\n")
    : null;
  const textBody = [
    `Hola ${input.firstName},`,
    "Recuerda que mañana tienes evento BOOMBOX.",
    `Evento: ${input.eventName}`,
    `Fecha: ${chileDate(input.eventDate)}`,
    input.customerName?.trim() ? `Cliente: ${input.customerName.trim()}` : null,
    input.service?.trim() ? `Servicio: ${input.service.trim()}` : null,
    `Rol(es): ${roles}`,
    time ? `Horario: ${time}` : null,
    callTime ? `Citación: ${callTime}` : null,
    location ? `Recinto / dirección: ${location}` : null,
    instructions ? `Instrucciones: ${instructions}` : null,
    specialElements.length ? `Elementos: ${specialElements.join(", ")}` : null,
    routeText ?? `Ver detalle en ORBIT: ${portal}`,
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n");
  const specialHtml = specialElements.length
    ? `<p style="margin:14px 0 0"><strong>Elementos operativos:</strong> ${escapeHtml(specialElements.join(" · "))}</p>`
    : "";
  const instructionHtml = instructions
    ? `<p style="margin:14px 0 0"><strong>Instrucciones:</strong><br>${escapeHtml(instructions).replaceAll("\n", "<br>")}</p>`
    : "";
  const routesHtml = routes.length
    ? `<div style="margin-top:18px"><p style="margin:0 0 9px;font-size:11px;font-weight:700;letter-spacing:.14em;color:#d76d00">RUTAS DEL DÍA SIGUIENTE</p>${routes.map((route) => `<div style="margin-top:10px;padding:14px;border:1px solid #e8e2d8;border-radius:10px;background:#ffffff"><p style="margin:0 0 10px;font-weight:700;color:#d76d00">${escapeHtml(route.label)}</p><p style="margin:5px 0"><strong>Evento:</strong> ${escapeHtml(route.eventName)}${route.customerName ? ` · ${escapeHtml(route.customerName)}` : ""}</p><p style="margin:5px 0"><strong>Dirección:</strong> ${escapeHtml(route.location ?? "Por confirmar")}</p><p style="margin:5px 0"><strong>Servicio:</strong> ${escapeHtml(route.service ?? "Por confirmar")}</p><p style="margin:5px 0"><strong>Caja:</strong> ${escapeHtml(route.boxCode ?? "Caja no asignada")}</p><p style="margin:5px 0"><strong>${route.role === "DISASSEMBLY" ? "Horario de desmontaje" : "Horario de montaje"}:</strong> ${escapeHtml(route.schedule ?? "Horario a confirmar")}</p>${route.instructions?.trim() ? `<p style="margin:10px 0 0"><strong>Observaciones:</strong> ${escapeHtml(route.instructions.trim())}</p>` : ""}${route.specialElements.length ? `<p style="margin:5px 0"><strong>Elementos:</strong> ${escapeHtml(route.specialElements.join(" · "))}</p>` : ""}</div>`).join("")}</div>`
    : "";
  const consolidatedContent = routes.length
    ? `<p style="margin:0">Hola ${escapeHtml(input.firstName)},</p><p style="margin:12px 0 0;font-size:18px;font-weight:700;color:#111214">Recuerda que mañana tienes rutas BOOMBOX.</p>${routesHtml}`
    : "";
  const content =
    consolidatedContent ||
    `<p style="margin:0">Hola ${escapeHtml(input.firstName)},</p><p style="margin:12px 0 0;font-size:18px;font-weight:700;color:#111214">Recuerda que mañana tienes evento BOOMBOX.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:23px;border:1px solid #e8e2d8;border-radius:13px;background:#faf9f6"><tr><td style="padding:18px"><p style="margin:0 0 10px;font-size:17px;font-weight:700">${escapeHtml(input.eventName)}</p><p style="margin:5px 0"><strong>Fecha:</strong> ${escapeHtml(chileDate(input.eventDate))}</p>${detail("Cliente", input.customerName)}${detail("Servicio", input.service)}<p style="margin:5px 0"><strong>Rol(es):</strong> ${escapeHtml(roles)}</p>${detail("Horario", time)}${detail("Hora de citación", callTime)}${detail("Recinto / dirección", location)}${instructionHtml}${specialHtml}</td></tr></table>`;
  return {
    subject:
      routes.length > 1
        ? `Mañana tienes rutas BOOMBOX · ${routes.length} eventos`
        : `Mañana tienes evento BOOMBOX · ${input.eventName}`,
    textBody,
    htmlBody: premiumFrame({
      appUrl: input.appUrl,
      preheader: "Recuerda que mañana tienes evento BOOMBOX.",
      eyebrow: "Recordatorio operacional · D-1",
      title: "Tu evento es mañana",
      content,
      ctaLabel: routes.length
        ? "Ver todas mis rutas en ORBIT"
        : "Ver detalle en ORBIT",
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
  company: {
    legalName: string;
    taxId: string;
    address: string;
    city: string;
  };
}) {
  const portal = `${input.appUrl.replace(/\/$/, "")}/staff-portal`;
  const month = input.monthLabel.replace(" de ", " ");
  const textBody = `Hola ${input.firstName},\n\nTu liquidación BOOMBOX de ${month} ya está cerrada.\n\nMonto de boleta: ${money(input.boletaGross)}\n\nDatos para emitir:\n\nRazón social: ${input.company.legalName}\nRUT: ${input.company.taxId}\nDirección: ${input.company.address}\nComuna: ${input.company.city}\nGlosa: OPERADOR EVENTOS\n\nPor favor ingresa a tu Portal Staff para subir tu boleta.\n${portal}`;
  const content = `<p style="margin:0">Hola ${escapeHtml(input.firstName)},</p><p style="margin:12px 0 0;font-size:18px;font-weight:700">Tu liquidación BOOMBOX de ${escapeHtml(month)} ya está cerrada.</p><p style="margin:10px 0 0"><strong>Monto de boleta:</strong> ${escapeHtml(money(input.boletaGross))}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border:1px solid #e8e2d8;border-radius:13px;background:#faf9f6"><tr><td style="padding:18px"><p style="margin:0 0 9px;font-size:11px;font-weight:700;letter-spacing:.14em;color:#d76d00">DATOS PARA EMITIR</p><p style="margin:3px 0;font-weight:700">Razón social: ${escapeHtml(input.company.legalName)}</p><p style="margin:3px 0">RUT: ${escapeHtml(input.company.taxId)}</p><p style="margin:3px 0">Dirección: ${escapeHtml(input.company.address)}</p><p style="margin:3px 0">Comuna: ${escapeHtml(input.company.city)}</p><p style="margin:12px 0 0"><strong>Glosa:</strong> OPERADOR EVENTOS</p></td></tr></table><p style="margin:18px 0 0">Por favor ingresa a tu Portal Staff para subir tu boleta.</p>`;
  return {
    subject: `BOOMBOX — Boleta de honorarios ${month}`,
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

export function buildStaffPeriodClosedEmail(input: {
  appUrl: string;
  firstName: string;
  periodLabel: string;
  firstQuincena: boolean;
  periodWork: number;
  monthlyWork: number;
  monthlyGross: number;
  monthlyRetention?: number;
  paid: number;
  remaining: number;
  reimbursementsPending: number;
  company: { legalName: string; taxId: string; address: string; city: string };
}) {
  const portal = `${input.appUrl.replace(/\/$/, "")}/staff-portal`;
  const first = input.firstQuincena;
  const label = first ? "PRIMERA QUINCENA" : "SEGUNDA QUINCENA";
  const title = label;
  const details = first
    ? [
        ["Honorarios del período", money(input.periodWork)],
        ["Honorarios ya pagados", money(input.paid)],
        ["Saldo pendiente de honorarios", money(input.remaining)],
        ["Reembolsos pendientes", money(input.reimbursementsPending)],
      ]
    : [
        ["Honorarios líquidos del mes", money(input.monthlyWork)],
        ["Retención aplicada a honorarios", money(input.monthlyRetention ?? 0)],
        ["Honorarios ya pagados", money(input.paid)],
        ["SALDO PENDIENTE DE PAGO", money(input.remaining)],
        ["Reembolsos pendientes (no sujetos a boleta)", money(input.reimbursementsPending)],
      ];
  const totalTransfer = input.remaining + input.reimbursementsPending;
  const boletaInstruction = first
    ? "NO DEBES EMITIR NI SUBIR BOLETA A ORBIT durante esta primera quincena. Al cierre del mes recibirás el total de honorarios del mes para emitir una única boleta mensual."
    : "AHORA SÍ DEBES EMITIR Y SUBIR UNA SOLA BOLETA MENSUAL A ORBIT por el 100% de los honorarios brutos del mes, aunque hayas trabajado solamente en la primera quincena. Los pagos anteriores se descuentan del saldo pendiente, no del monto de la boleta.";
  const paymentNotice = first
    ? "El pago se realizará dentro de los 3 primeros días hábiles posteriores al cierre, sujeto a las validaciones correspondientes. Este aviso no confirma una transferencia."
    : "El saldo pendiente de pago refleja los pagos y anticipos registrados y las retenciones aplicables; es distinto del total bruto de la boleta. Los reembolsos se presentan por separado y no forman parte de ella.";
  const subject = `BOOMBOX® | ${label} — ${first ? "Liquidación disponible" : "Cierre mensual y boleta"}`;
  const textBody = [
    `Hola ${input.firstName},`,
    `${label} — ${input.periodLabel}`,
    "Tu liquidación está cerrada. Adjuntamos el PDF con el detalle de tus eventos.",
    ...details.map(([name, value]) => `${name}: ${value}`),
    first
      ? `TOTAL PENDIENTE POR TRANSFERIR: ${money(totalTransfer)}`
      : `TOTAL PARA EMITIR BOLETA: ${money(input.monthlyGross)}`,
    ...(!first ? [`SALDO PENDIENTE DE PAGO: ${money(input.remaining)}`] : []),
    boletaInstruction,
    paymentNotice,
    ...(first ? [] : [
      `Razón social: ${input.company.legalName}`,
      `RUT: ${input.company.taxId}`,
      `Dirección: ${input.company.address} · ${input.company.city}`,
      "Glosa: HONORARIOS SERVICIOS EVENTOS",
    ]),
    `Portal Staff: ${portal}`,
  ].join("\n\n");
  const row = (name: string, value: string) =>
    `<tr><td style="padding:11px 12px;border-bottom:1px solid #ece8e1;font:13px/1.45 Arial,sans-serif;color:#56534f">${escapeHtml(name)}</td><td align="right" style="padding:11px 12px;border-bottom:1px solid #ece8e1;font:700 14px/1.45 Arial,sans-serif;color:#111214;white-space:nowrap">${escapeHtml(value)}</td></tr>`;
  const content = `
    <p style="margin:0;font:15px/1.6 Arial,sans-serif">Hola <strong>${escapeHtml(input.firstName)}</strong>,</p>
    <p style="margin:12px 0 20px;font:15px/1.6 Arial,sans-serif">Tu liquidación correspondiente a <strong>${escapeHtml(input.periodLabel)}</strong> está cerrada. Encontrarás el detalle de los eventos en el PDF adjunto.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e7e1d8;border-radius:10px;background:#fff">
      <tr><td colspan="2" style="padding:13px 12px;background:#f6f3ee;font:700 11px Arial,sans-serif;letter-spacing:.1em;color:#b35b00">RESUMEN DE LIQUIDACIÓN</td></tr>
      ${details.map(([name, value]) => row(name, value)).join("")}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;background:#101113;border-left:5px solid #f78900;border-radius:8px"><tr><td style="padding:17px 16px">
      <p style="margin:0 0 6px;font:700 11px Arial,sans-serif;letter-spacing:.08em;color:#f78900">${first ? "TOTAL PENDIENTE POR TRANSFERIR" : "TOTAL PARA EMITIR BOLETA"}</p>
      <p style="margin:0;font:700 26px/1.25 Arial,sans-serif;color:#ffffff">${escapeHtml(money(first ? totalTransfer : input.monthlyGross))}</p>
      <p style="margin:7px 0 0;font:12px/1.5 Arial,sans-serif;color:#d6d3cf">${first ? "Incluye honorarios pendientes y reembolsos, mostrados por separado arriba." : "Corresponde al 100% de honorarios brutos mensuales; no incluye reembolsos ni se reduce por anticipos."}</p>
    </td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:23px;background:${first ? "#fff4e5" : "#f6f3ee"};border-left:5px solid #f78900;border-radius:8px"><tr><td style="padding:16px;font:700 14px/1.6 Arial,sans-serif;color:#202124"><p style="margin:0 0 7px;font:700 11px Arial,sans-serif;letter-spacing:.08em;color:#b35b00">${first ? "PRIMERA QUINCENA · SIN BOLETA" : "SEGUNDA QUINCENA · BOLETA MENSUAL"}</p>${escapeHtml(boletaInstruction)}</td></tr></table>
    <p style="margin:${first ? "18px" : "0"} 0 14px;font:13px/1.6 Arial,sans-serif;color:#56534f">${escapeHtml(paymentNotice)}</p>
    ${first ? "" : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f3ee;border-radius:8px"><tr><td style="padding:16px;font:13px/1.7 Arial,sans-serif;color:#242424"><strong>DATOS PARA EMITIR</strong><p style="margin:8px 0 0">Razón social: ${escapeHtml(input.company.legalName)}<br>RUT: ${escapeHtml(input.company.taxId)}<br>Dirección: ${escapeHtml(input.company.address)} · ${escapeHtml(input.company.city)}<br>Glosa: HONORARIOS SERVICIOS EVENTOS</p></td></tr></table>`}
  `;
  return {
    subject,
    textBody,
    htmlBody: premiumFrame({
      appUrl: input.appUrl,
      preheader: first ? "Tu liquidación de primera quincena está disponible." : "Cierre mensual: revisa tu liquidación y emite una sola boleta.",
      eyebrow: "FINANZAS · STAFF",
      title,
      content,
      ctaLabel: first ? "VER MI LIQUIDACIÓN EN ORBIT" : "SUBIR BOLETA MENSUAL A ORBIT",
      ctaHref: portal,
      showOfficialWhiteLogo: true,
    }),
  };
}

/** Reuses the approved Staff premium frame for a committed bank payment. */
export function buildStaffPaymentPaidEmail(input: {
  firstName: string; periodLabel: string; paidOn: string; reference: string;
  honoraria: number; reimbursements: number; total: number;
}) {
  const amounts = [input.honoraria, input.reimbursements, input.total];
  if (amounts.some((n) => !Number.isSafeInteger(n) || n < 0) ||
      input.honoraria + input.reimbursements !== input.total || input.total <= 0)
    throw new Error("Montos de confirmación inconsistentes.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || !input.reference.trim())
    throw new Error("Faltan fecha o referencia del pago.");
  const details: Array<[string,string]> = [
    ["Período", input.periodLabel], ["Fecha de transferencia", chileDate(input.paidOn)],
    ["Referencia", input.reference], ["Honorarios", money(input.honoraria)],
    ["Reembolsos", money(input.reimbursements)], ["TOTAL TRANSFERIDO", money(input.total)]
  ];
  const rows = details.map(([label,value]) =>
    `<tr><td style="padding:10px 12px;border-bottom:1px solid #ece8e1;color:#56534f">${escapeHtml(label)}</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #ece8e1;font-weight:700">${escapeHtml(value)}</td></tr>`
  ).join("");
  const textBody = [`Hola ${input.firstName},`, "BOOMBOX confirma que tu transferencia fue registrada.",
    ...details.map(([k,v])=>`${k}: ${v}`),
    "Adjuntamos el comprobante bancario de esta transferencia.",
    "BOOMBOX® · Comunicación emitida mediante ORBIT"].join("\n");
  const htmlBody = premiumFrame({
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bbox.cl",
    preheader: "Confirmación de transferencia BOOMBOX",
    eyebrow: "FINANZAS STAFF",
    title: "Tu pago fue realizado",
    content: `<p>Hola <strong>${escapeHtml(input.firstName)}</strong>,</p><p>Confirmamos que BOOMBOX registró tu transferencia.</p><table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table><p>Adjuntamos el comprobante bancario correspondiente.</p>`,
    ctaLabel: "IR A MI PORTAL STAFF",
    ctaHref: (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bbox.cl") + "/staff-portal",
    showOfficialWhiteLogo: true
  });
  return {subject: "BOOMBOX® | Confirmación de pago",textBody,htmlBody};
}

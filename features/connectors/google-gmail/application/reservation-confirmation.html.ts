import { renderBoomboxCommercialEmail } from "./boombox-commercial-email.html.ts";

export const RESERVATION_CONFIRMATION_PORTAL_CTA = "ABRIR EVENTO EN ORBIT";

export type ReservationConfirmationRenderInput = {
  body: string;
  website: string;
  companyCommercial: boolean;
  portalCtaAvailable: boolean;
  portalUrl: string | null;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

export function renderReservationConfirmationHtml(
  body: string,
  website: string,
  options: { companyCommercial: boolean; portalUrl?: string },
) {
  const normalizedBody = body.replace(/\r\n?/g, "\n");
  const paragraphs = normalizedBody
    .split(/\n{2,}/)
    .map((paragraph) => {
      const value = paragraph.trim();
      if (value === "BIENVENIDOS A BOOMBOX") return "";
      if (
        [
          "SERVICIO CONTRATADO",
          "INFORMACIÓN DEL EVENTO",
          "VALOR DEL SERVICIO CONTRATADO",
        ].includes(value)
      )
        return `<h2 style="margin:30px 0 14px;padding-top:18px;border-top:1px solid #eee;font-size:13px;letter-spacing:.12em;color:#e67800">${escapeHtml(value)}</h2>`;
      if (value === RESERVATION_CONFIRMATION_PORTAL_CTA)
        return "";
      const [label, ...detail] = value.split("\n");
      if (label === "Valor total" && detail.length)
        return `<p style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:800;color:#171717">${escapeHtml(detail.join(" "))}</p>`;
      if (
        detail.length &&
        [
          "Servicio",
          "Duración",
          "Extras",
          "Fecha",
          "Horario",
          "Lugar",
          "Abono recibido",
          "Saldo pendiente",
        ].includes(label)
      )
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;margin:0 0 12px"><tr><td style="width:40%;padding-right:12px;color:#777;font-size:14px;vertical-align:top">${escapeHtml(label)}</td><td align="right" style="font-size:15px;font-weight:700;vertical-align:top;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(detail.join(" "))}</td></tr></table>`;
      return `<p style="margin:0 0 18px">${escapeHtml(value).replaceAll("\n", "<br>")}</p>`;
    })
    .join("");
  return renderBoomboxCommercialEmail({
    preheader: "Tu reserva BOOMBOX está confirmada.",
    eyebrow: "RESERVA CONFIRMADA",
    title: "BIENVENIDOS A BOOMBOX",
    contentHtml: paragraphs,
    website,
    stackedHeader: true,
    fixedLayout: true,
    primaryAction: options.portalUrl
      ? { href: options.portalUrl, label: "ABRIR EVENTO EN ORBIT" }
      : undefined,
    attachmentNote: options.companyCommercial
      ? "Tu documento comercial oficial se encuentra adjunto a este correo."
      : undefined,
  });
}

/**
 * Single delivery/preview entry point. Keeping CTA eligibility here guarantees
 * the Founder preview and the provider payload render the same HTML.
 */
export function renderReservationConfirmationDelivery(
  input: ReservationConfirmationRenderInput,
) {
  const portalUrl =
    input.portalCtaAvailable &&
    input.portalUrl &&
    input.body.replace(/\r\n?/g, "\n").includes(RESERVATION_CONFIRMATION_PORTAL_CTA)
      ? input.portalUrl
      : undefined;
  return {
    htmlBody: renderReservationConfirmationHtml(input.body, input.website, {
      companyCommercial: input.companyCommercial,
      portalUrl,
    }),
    portalUrl,
  };
}

export const DIGITAL_PHOTO_REVIEW_URL =
  "https://g.page/r/CZpNpQkYOwLnEAI/review";
export const DIGITAL_PHOTO_SUBJECT = "Tus fotos BOOMBOX ya están disponibles 📸";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function validateDigitalPhotoDeliveryUrl(value: string) {
  const candidate = value.trim();
  if (!candidate) throw new Error("Ingresa un enlace válido para las fotos digitales.");
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("unsafe");
    }
  } catch {
    throw new Error("Ingresa un enlace válido para las fotos digitales.");
  }
  return candidate;
}

export function digitalPhotoDeliveryText(customerName: string, photoUrl: string) {
  return [
    `Hola ${customerName},`,
    "",
    "Esperamos que te encuentres muy bien.",
    "",
    "Queremos agradecerte por elegir a BOOMBOX y permitirnos ser parte de tu evento.",
    "",
    "Esperamos que tú y tus invitados hayan disfrutado la experiencia BOOMBOX y que estos recuerdos los acompañen por mucho tiempo.",
    "",
    "TUS FOTOS DIGITALES YA ESTÁN DISPONIBLES PARA DESCARGA",
    "El enlace estará disponible durante 10 días.",
    "Te recomendamos descargar y guardar tus fotos dentro de este plazo.",
    photoUrl,
    "",
    "TU EXPERIENCIA NOS IMPORTA",
    "Si disfrutaste la experiencia BOOMBOX, nos ayudaría muchísimo que pudieras compartir tu opinión.",
    "Tu reseña nos permite seguir mejorando y ayuda a otras personas a elegir su experiencia para futuros eventos.",
    DIGITAL_PHOTO_REVIEW_URL,
    "",
    "Nuevamente, muchas gracias por confiar en BOOMBOX y permitirnos ser parte de tu evento.",
    "",
    "Un abrazo,",
    "Equipo BOOMBOX 📸✨",
  ].join("\n");
}

export function renderDigitalPhotoDeliveryHtml(
  customerName: string,
  suppliedPhotoUrl: string,
) {
  const photoUrl = validateDigitalPhotoDeliveryUrl(suppliedPhotoUrl);
  const customer = escapeHtml(customerName.trim() || "Cliente");
  const safePhotoUrl = escapeHtml(photoUrl);
  const reviewUrl = escapeHtml(DIGITAL_PHOTO_REVIEW_URL);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f7;padding:0"><div style="display:none;max-height:0;overflow:hidden">Tus fotos BOOMBOX ya están disponibles.</div><main style="width:100%;padding:28px 12px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#17191f"><section style="max-width:620px;margin:0 auto;overflow:hidden;border:1px solid #e3e5e9;border-radius:20px;background:#ffffff;box-shadow:0 16px 42px rgba(17,24,39,.08)"><header style="background:#101216;padding:25px 28px;border-bottom:4px solid #f68b1f"><div style="font-size:22px;font-weight:800;letter-spacing:.08em;color:#ffffff">BOOMBOX</div><div style="margin-top:7px;font-size:12px;letter-spacing:.12em;color:#f6a452;text-transform:uppercase">Fotos digitales</div></header><div style="padding:28px"><p style="margin:0 0 18px;font-size:18px;font-weight:700;line-height:1.45;color:#17191f">Hola ${customer},</p><p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333740">Esperamos que te encuentres muy bien.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333740">Queremos agradecerte por elegir a BOOMBOX y permitirnos ser parte de tu evento.</p><p style="margin:0;font-size:15px;line-height:1.6;color:#333740">Esperamos que tú y tus invitados hayan disfrutado la experiencia BOOMBOX y que estos recuerdos los acompañen por mucho tiempo.</p><section style="margin:26px 0;border:1px solid #f1c99f;border-radius:16px;padding:22px;background:#fff9f2"><div style="display:inline-block;vertical-align:top;width:48px;height:48px;border:2px solid #f07f16;border-radius:50%;font-size:23px;line-height:48px;text-align:center" aria-hidden="true">📸</div><div style="display:inline-block;vertical-align:top;box-sizing:border-box;width:calc(100% - 58px);padding-left:14px"><h2 style="margin:0;font-size:16px;line-height:1.45;color:#17191f">Tus fotos digitales ya están disponibles para descarga.</h2><p style="margin:5px 0 0;font-size:14px;line-height:1.55;color:#333740">El enlace estará disponible durante 10 días.<br>Te recomendamos descargar y guardar tus fotos dentro de este plazo.</p></div><div style="margin-top:20px;text-align:center"><a href="${safePhotoUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;box-sizing:border-box;max-width:100%;border-radius:12px;background:#ed7203;padding:14px 28px;font-size:15px;font-weight:800;letter-spacing:.04em;color:#ffffff;text-decoration:none">DESCARGAR FOTOS</a></div></section><section style="margin:26px 0;border:1px solid #f1c99f;border-radius:16px;padding:22px;background:#fff9f2"><div style="display:inline-block;vertical-align:top;width:48px;height:48px;border:2px solid #f07f16;border-radius:50%;font-size:25px;line-height:48px;text-align:center;color:#f07f16" aria-hidden="true">☆</div><div style="display:inline-block;vertical-align:top;box-sizing:border-box;width:calc(100% - 58px);padding-left:14px"><h2 style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;color:#d85f00;text-transform:uppercase">Tu experiencia nos importa</h2><p style="margin:0;font-size:14px;line-height:1.55;color:#333740">Si disfrutaste la experiencia BOOMBOX, nos ayudaría muchísimo que pudieras compartir tu opinión.</p><p style="margin:7px 0 0;font-size:14px;line-height:1.55;color:#333740">Tu reseña nos permite seguir mejorando y ayuda a otras personas a elegir su experiencia para futuros eventos.</p></div><div style="margin-top:20px;text-align:center"><a href="${reviewUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;box-sizing:border-box;max-width:100%;border:1px solid #ed7203;border-radius:12px;background:#ffffff;padding:13px 22px;font-size:14px;font-weight:800;letter-spacing:.03em;color:#d85f00;text-decoration:none">DEJAR UNA RESEÑA EN GOOGLE</a></div></section><p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333740">Nuevamente, muchas gracias por confiar en BOOMBOX y permitirnos ser parte de tu evento.</p><p style="margin:0;font-size:15px;line-height:1.55;color:#333740">Un abrazo,<br><strong>Equipo BOOMBOX 📸✨</strong></p></div><footer style="border-top:1px solid #eceef2;padding:18px 28px;font-size:11px;line-height:1.6;color:#7a808b">BOOMBOX · Comunicación emitida mediante ORBIT<br>ORBIT · Software desarrollado por BOOMBOX<br><a href="https://www.bbox.cl" style="color:#f07f16;text-decoration:none">www.bbox.cl</a></footer></section></main></body></html>`;
}

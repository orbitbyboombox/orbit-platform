export const BBOX360_VIDEO_SUBJECT = "Tus videos BBOX 360 están disponibles | BOOMBOX";

export function validateBbox360VideoDeliveryUrl(value: string) {
  const candidate = value.trim();
  if (!candidate) throw new Error("Ingresa un enlace válido para los videos BBOX 360.");
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) throw new Error("unsafe");
  } catch {
    throw new Error("Ingresa un enlace válido para los videos BBOX 360.");
  }
  return candidate;
}

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function eventDateLabel(value: string) {
  const candidate = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) throw new Error("El Evento no tiene una fecha canónica válida.");
  const date = new Date(`${candidate}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) throw new Error("El Evento no tiene una fecha canónica válida.");
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function bbox360VideoDeliveryText(customerName: string, eventDate: string, videoUrl: string) {
  return [`Hola ${customerName},`, "", "Tus videos de la experiencia BBOX 360 ya están disponibles.", `Evento: ${eventDateLabel(eventDate)}`, "", videoUrl, "", "Gracias por confiar en BOOMBOX.", "", "Equipo BOOMBOX"].join("\n");
}

export function renderBbox360VideoDeliveryHtml(customerName: string, eventDate: string, suppliedVideoUrl: string) {
  const url = escapeHtml(validateBbox360VideoDeliveryUrl(suppliedVideoUrl));
  const customer = escapeHtml(customerName.trim() || "Cliente");
  const date = escapeHtml(eventDateLabel(eventDate));
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f7;padding:0"><main style="width:100%;padding:28px 12px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#17191f"><section style="max-width:620px;margin:0 auto;overflow:hidden;border:1px solid #e3e5e9;border-radius:20px;background:#ffffff"><header style="background:#101216;padding:25px 28px;border-bottom:4px solid #f68b1f"><div style="font-size:22px;font-weight:800;letter-spacing:.08em;color:#ffffff">BOOMBOX</div><div style="margin-top:7px;font-size:12px;letter-spacing:.12em;color:#f6a452;text-transform:uppercase">Videos BBOX 360</div></header><div style="padding:28px"><p style="margin:0 0 18px;font-size:18px;font-weight:700;line-height:1.45;color:#17191f">Hola ${customer},</p><p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333740">Tus videos de la experiencia BBOX 360 ya están disponibles.</p><p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#333740">Evento: ${date}</p><div style="text-align:center"><a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;border-radius:12px;background:#ed7203;padding:14px 28px;font-size:15px;font-weight:800;letter-spacing:.04em;color:#ffffff;text-decoration:none">VER VIDEOS BBOX 360</a></div><p style="margin:26px 0 0;font-size:15px;line-height:1.6;color:#333740">Gracias por confiar en BOOMBOX.</p><p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#333740">Un abrazo,<br><strong>Equipo BOOMBOX</strong></p></div><footer style="border-top:1px solid #eceef2;padding:18px 28px;font-size:11px;line-height:1.6;color:#7a808b">BOOMBOX · Comunicación emitida mediante ORBIT</footer></section></main></body></html>`;
}

export function renderBbox360VideoDeliveryPreviewHtml(customerName: string, eventDate: string, suppliedVideoUrl: string) {
  const placeholder = "https://preview.invalid/videos-bbox360";
  try { return renderBbox360VideoDeliveryHtml(customerName, eventDate, suppliedVideoUrl); } catch { return renderBbox360VideoDeliveryHtml(customerName, eventDate, placeholder).replace("VER VIDEOS BBOX 360", "VER VIDEOS BBOX 360 (AGREGA EL ENLACE)"); }
}

import type { NotificationResult, QuotePayload } from "./intake.ts";

export async function sendWebQuoteNotification(quote: QuotePayload, options: {
  isTest: boolean; loadToken(): Promise<string>; fetcher?: typeof fetch;
}): Promise<NotificationResult> {
  // No recipient, CC, BCC, From, URL, or environment selector comes from the form.
  const recipient = options.isTest ? "matias.maira.larrain@gmail.com" : "contacto@bbox.cl";
  let token: string;
  try { token = await options.loadToken(); }
  catch { return { state: "FAILED", errorCode: "WORKSPACE_AUTH_UNAVAILABLE" }; }
  const body = [options.isTest ? "PRUEBA TÉCNICA BOOMBOX — NO CLIENTE" : "NUEVA COTIZACIÓN BOOMBOX",
    `ID: ${quote.solicitudId}`, `Nombre: ${quote.nombre}`, `Teléfono: ${quote.telefono}`,
    `Correo: ${quote.correo}`, `Tipo: ${quote.tipo}`, `Servicio: ${quote.servicio || "Por definir"}`,
    `Fecha: ${quote.fecha || "Por definir"}`, `Horario: ${quote.horario || "Por definir"}`,
    `Lugar: ${quote.lugarEvento}`, `Mensaje: ${quote.mensaje}`, `Origen: ${quote.paginaOrigen}`].join("\n");
  const subject = Buffer.from(options.isTest ? "PRUEBA TÉCNICA BOOMBOX — NO CLIENTE" : "Nueva cotización BOOMBOX").toString("base64");
  const mime = [`To: ${recipient}`, `Subject: =?UTF-8?B?${subject}?=`, "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", Buffer.from(body).toString("base64")].join("\r\n");
  try {
    const response = await (options.fetcher ?? fetch)("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }), signal: AbortSignal.timeout(10000),
    });
    // One attempt only. 5xx/timeouts can happen AFTER Gmail accepted the message.
    if (!response.ok) return { state: response.status >= 500 || response.status === 429 ? "UNKNOWN" : "FAILED", errorCode: `GMAIL_HTTP_${response.status}` };
    const result = await response.json() as { id?: string };
    if (!result.id) return { state: "UNKNOWN", errorCode: "GMAIL_MISSING_MESSAGE_ID" };
    return { state: "ACCEPTED", providerId: result.id };
  } catch { return { state: "UNKNOWN", errorCode: "GMAIL_SEND_UNCERTAIN" }; }
}

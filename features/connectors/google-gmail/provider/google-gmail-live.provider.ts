export interface GoogleGmailProviderMessage {
  to: string;
  cc?: readonly string[];
  idempotencyKey?: string;
  maxSendAttempts?: number;
  subject: string;
  textBody: string;
  htmlBody: string;
  threadId?: string;
  replyToMessageId?: string;
  driveFileIds: readonly string[];
  attachments?: readonly { filename: string; mimeType: string; content: Uint8Array }[];
}

/**
 * Gives every outgoing ORBIT email a conservative, client-compatible surface.
 * Inline colors and legacy bgcolor attributes are intentional: Outlook and
 * Gmail dark mode do not consistently honor the same CSS/media-query rules.
 */
export function normalizeBoomBoxEmailHtml(html: string): string {
  const normalized = html.trim();
  const colorMeta = '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">';
  if (!/<html[\s>]/i.test(normalized)) {
    return `<!doctype html><html><head><meta charset="utf-8">${colorMeta}</head><body bgcolor="#0b0c0e" style="margin:0;padding:0;background-color:#0b0c0e;color:#ffffff;color-scheme:light dark"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0c0e" style="width:100%;background-color:#0b0c0e"><tr><td style="padding:24px 16px;font-family:Arial,sans-serif;color:#ffffff;background-color:#0b0c0e">${normalized}</td></tr></table></body></html>`;
  }
  const withMeta = /<head[^>]*>/i.test(normalized)
    ? normalized.replace(/<head[^>]*>/i, (tag) => `${tag}${colorMeta}`)
    : normalized.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${colorMeta}</head>`);
  return withMeta.replace(/<body([^>]*)>/i, (_tag, attributes: string) => {
    const existingStyle = /style="([^"]*)"/i.exec(attributes)?.[1] ?? "";
    const withoutStyle = attributes.replace(/\sstyle="[^"]*"/i, "");
    return `<body${withoutStyle} bgcolor="#ece9e3" style="${existingStyle}${existingStyle && !existingStyle.trim().endsWith(";") ? ";" : ""}background-color:#ece9e3;color:#171717;color-scheme:light dark">`;
  });
}

const utf8Base64Url = (value: string) => btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const utf8Base64 = (value: string) => btoa(unescape(encodeURIComponent(value)));
const encodedSubject = (value: string) => `=?UTF-8?B?${utf8Base64(value)}?=`;
const bytesBase64 = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value); let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
};

export interface GoogleGmailProviderResult { messageId: string; threadId: string; }
export interface GoogleGmailDraftResult extends GoogleGmailProviderResult { draftId: string; }
export interface GoogleGmailLiveProvider { send(message: GoogleGmailProviderMessage): Promise<GoogleGmailProviderResult>; createDraft(message: GoogleGmailProviderMessage): Promise<GoogleGmailDraftResult>; }

export class InMemoryGoogleGmailLiveProvider implements GoogleGmailLiveProvider {
  async send(message: GoogleGmailProviderMessage) {
    const key = message.threadId ?? message.to.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return { threadId: message.threadId ?? `gmail-thread-${key}`, messageId: `gmail-message-${key}` };
  }
  async createDraft(message: GoogleGmailProviderMessage) { const sent = await this.send(message); return { ...sent, draftId: `gmail-draft-${sent.messageId}` }; }
}

export class GoogleGmailApiProvider implements GoogleGmailLiveProvider {
  private readonly accessToken: string;
  private readonly userId: string;
  constructor(accessToken: string, userId = "me") {
    this.accessToken = accessToken;
    this.userId = userId;
  }
  private async raw(message: GoogleGmailProviderMessage): Promise<string> {
    const htmlBody = normalizeBoomBoxEmailHtml(message.htmlBody);
    const headers = [`To: ${message.to}`, `Subject: ${encodedSubject(message.subject)}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8"];
    if (message.cc?.length) headers.splice(1, 0, `Cc: ${message.cc.join(", ")}`);
    if (message.idempotencyKey) {
      const safeKey = message.idempotencyKey.replace(/[^a-zA-Z0-9._-]+/g, "-");
      headers.push(`Message-ID: <${safeKey}@orbit.boom-box.cl>`, `X-ORBIT-Idempotency-Key: ${safeKey}`);
    }
    if (message.replyToMessageId) headers.push(`In-Reply-To: ${message.replyToMessageId}`, `References: ${message.replyToMessageId}`);
    if (!message.driveFileIds.length && !message.attachments?.length) return utf8Base64Url(`${headers.join("\r\n")}\r\n\r\n${htmlBody}`);
    const boundary = `orbit-${crypto.randomUUID()}`;
    const driveAttachments = await Promise.all(message.driveFileIds.map(async (fileId) => {
      const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType`, { headers: { Authorization: `Bearer ${this.accessToken}` } });
      if (!metadataResponse.ok) throw new Error(`Google Drive attachment metadata failed (${metadataResponse.status}): ${await metadataResponse.text()}`);
      const metadata = await metadataResponse.json() as { name: string; mimeType: string };
      const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${this.accessToken}` } });
      if (!fileResponse.ok) throw new Error(`Google Drive attachment download failed (${fileResponse.status}): ${await fileResponse.text()}`);
      const encoded = bytesBase64(await fileResponse.arrayBuffer()).replace(/.{1,76}/g, "$&\r\n");
      return [`--${boundary}`, `Content-Type: ${metadata.mimeType}; name="${metadata.name.replaceAll('"', "'") }"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${metadata.name.replaceAll('"', "'") }"`, "", encoded].join("\r\n");
    }));
    const directAttachments = (message.attachments ?? []).map((attachment) => {
      const filename = attachment.filename.replaceAll('"', "'");
      const encoded = bytesBase64(attachment.content).replace(/.{1,76}/g, "$&\r\n");
      return [`--${boundary}`, `Content-Type: ${attachment.mimeType}; name="${filename}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${filename}"`, "", encoded].join("\r\n");
    });
    const attachments = [...driveAttachments, ...directAttachments];
    const mixedHeaders = headers.filter((header) => !header.startsWith("Content-Type:"));
    const body = [...mixedHeaders, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", htmlBody, ...attachments, `--${boundary}--`].join("\r\n");
    return utf8Base64Url(body);
  }
  async send(message: GoogleGmailProviderMessage): Promise<GoogleGmailProviderResult> {
    const raw = await this.raw(message);
    const maxAttempts = message.maxSendAttempts ?? 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.userId)}/messages/send`, { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw, threadId: message.threadId }) });
      if (response.ok) { const result = await response.json() as { id: string; threadId: string }; return { messageId: result.id, threadId: result.threadId }; }
      const detail = await response.text();
      if (attempt === maxAttempts || (response.status < 500 && response.status !== 429)) throw new Error(`Gmail request failed (${response.status}): ${detail}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
    throw new Error("Gmail request failed after retries.");
  }
  async createDraft(message: GoogleGmailProviderMessage): Promise<GoogleGmailDraftResult> {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.userId)}/drafts`, { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { raw: await this.raw(message), threadId: message.threadId } }) });
    if (!response.ok) throw new Error(`Gmail draft request failed (${response.status}): ${await response.text()}`);
    const result = await response.json() as { id: string; message: { id: string; threadId: string } };
    return { draftId: result.id, messageId: result.message.id, threadId: result.message.threadId };
  }
}

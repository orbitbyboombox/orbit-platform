export interface GoogleGmailProviderMessage {
  to: string;
  cc?: readonly string[];
  from?: string;
  replyTo?: string;
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

const utf8Base64Url = (value: string) => btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const utf8Base64 = (value: string) => btoa(unescape(encodeURIComponent(value)));
const encodedSubject = (value: string) => `=?UTF-8?B?${utf8Base64(value)}?=`;
const safeHeaderValue = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized || /[\r\n]/.test(normalized)) throw new Error(`Invalid ${label} header.`);
  return normalized;
};
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
    const headers = [`To: ${safeHeaderValue(message.to, "recipient")}`, `Subject: ${encodedSubject(message.subject)}`, "MIME-Version: 1.0"];
    // Brand all ORBIT outbound mail while preserving the authenticated sender address.
    // Gmail accepts the From header only for the authenticated account or a verified send-as alias.
    const explicitSender = message.from?.match(/<([^<>]+)>\s*$/)?.[1] ?? message.from?.trim();
    let senderAddress = explicitSender;
    if (!senderAddress) {
      // Gmail's users.getProfile endpoint requires mailbox-read scopes such as
      // gmail.metadata; ORBIT intentionally grants gmail.send only. Resolve the
      // authenticated account through Google's OIDC email scope instead.
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!profileResponse.ok) throw new Error("No se pudo verificar la cuenta remitente de Gmail.");
      const profile = (await profileResponse.json()) as { email?: string };
      senderAddress = profile.email?.trim();
    }
    if (!senderAddress || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderAddress)) {
      throw new Error("La dirección remitente de Gmail no es válida.");
    }
    headers.push(`From: =?UTF-8?B?${utf8Base64("BOOMBOX Cabinas Fotográficas")}?= <${safeHeaderValue(senderAddress, "From")}>`);
    if (message.replyTo) headers.push(`Reply-To: ${safeHeaderValue(message.replyTo, "Reply-To")}`);
    if (message.cc?.length) headers.splice(1, 0, `Cc: ${message.cc.join(", ")}`);
    if (message.idempotencyKey) {
      const safeKey = message.idempotencyKey.replace(/[^a-zA-Z0-9._-]+/g, "-");
      headers.push(`Message-ID: <${safeKey}@orbit.boom-box.cl>`, `X-ORBIT-Idempotency-Key: ${safeKey}`);
    }
    if (message.replyToMessageId) headers.push(`In-Reply-To: ${message.replyToMessageId}`, `References: ${message.replyToMessageId}`);
    const alternativeBoundary = `orbit-alt-${crypto.randomUUID()}`;
    const alternativeBody = [
      `--${alternativeBoundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      message.textBody,
      `--${alternativeBoundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      message.htmlBody,
      `--${alternativeBoundary}--`,
    ].join("\r\n");
    if (!message.driveFileIds.length && !message.attachments?.length) {
      return utf8Base64Url([
        ...headers,
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        "",
        alternativeBody,
      ].join("\r\n"));
    }
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
    const body = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, "", alternativeBody, ...attachments, `--${boundary}--`].join("\r\n");
    return utf8Base64Url(body);
  }
  async send(message: GoogleGmailProviderMessage): Promise<GoogleGmailProviderResult> {
    const raw = await this.raw(message);
    const maxAttempts = Math.min(3, Math.max(1, Math.trunc(message.maxSendAttempts ?? 3)));
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

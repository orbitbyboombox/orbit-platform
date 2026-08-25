export interface GoogleGmailProviderMessage {
  to: string;
  cc?: readonly string[];
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
    const headers = [`To: ${message.to}`, `Subject: ${encodedSubject(message.subject)}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8"];
    if (message.cc?.length) headers.splice(1, 0, `Cc: ${message.cc.join(", ")}`);
    if (message.replyToMessageId) headers.push(`In-Reply-To: ${message.replyToMessageId}`, `References: ${message.replyToMessageId}`);
    if (!message.driveFileIds.length && !message.attachments?.length) return utf8Base64Url(`${headers.join("\r\n")}\r\n\r\n${message.htmlBody}`);
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
    const body = [...mixedHeaders, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", message.htmlBody, ...attachments, `--${boundary}--`].join("\r\n");
    return utf8Base64Url(body);
  }
  async send(message: GoogleGmailProviderMessage): Promise<GoogleGmailProviderResult> {
    const raw = await this.raw(message);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.userId)}/messages/send`, { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw, threadId: message.threadId }) });
      if (response.ok) { const result = await response.json() as { id: string; threadId: string }; return { messageId: result.id, threadId: result.threadId }; }
      const detail = await response.text();
      if (attempt === 3 || (response.status < 500 && response.status !== 429)) throw new Error(`Gmail request failed (${response.status}): ${detail}`);
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

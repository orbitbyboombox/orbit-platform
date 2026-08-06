export interface GoogleGmailProviderMessage {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  threadId?: string;
  replyToMessageId?: string;
  driveFileIds: readonly string[];
}

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
  constructor(private readonly accessToken: string, private readonly userId = "me") {}
  private raw(message: GoogleGmailProviderMessage): string {
    const headers = [`To: ${message.to}`, `Subject: ${message.subject}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8"];
    if (message.replyToMessageId) headers.push(`In-Reply-To: ${message.replyToMessageId}`, `References: ${message.replyToMessageId}`);
    return btoa(unescape(encodeURIComponent(`${headers.join("\r\n")}\r\n\r\n${message.htmlBody}`))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async send(message: GoogleGmailProviderMessage): Promise<GoogleGmailProviderResult> {
    const raw = this.raw(message);
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.userId)}/messages/send`, { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw, threadId: message.threadId }) });
    if (!response.ok) throw new Error(`Gmail request failed (${response.status}): ${await response.text()}`);
    const result = await response.json() as { id: string; threadId: string };
    return { messageId: result.id, threadId: result.threadId };
  }
  async createDraft(message: GoogleGmailProviderMessage): Promise<GoogleGmailDraftResult> {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.userId)}/drafts`, { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { raw: this.raw(message), threadId: message.threadId } }) });
    if (!response.ok) throw new Error(`Gmail draft request failed (${response.status}): ${await response.text()}`);
    const result = await response.json() as { id: string; message: { id: string; threadId: string } };
    return { draftId: result.id, messageId: result.message.id, threadId: result.message.threadId };
  }
}

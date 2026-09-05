export interface WhatsAppCloudTextMessage {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface WhatsAppCloudSendResult {
  messageId: string;
}

export class WhatsAppCloudProvider {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly graphVersion: string,
  ) {}

  async sendText(message: WhatsAppCloudTextMessage): Promise<WhatsAppCloudSendResult> {
    const endpoint = `https://graph.facebook.com/${encodeURIComponent(this.graphVersion)}/${encodeURIComponent(this.phoneNumberId)}/messages`;
    let lastDetail = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: message.to,
          type: "text",
          text: {
            preview_url: message.previewUrl ?? false,
            body: message.body,
          },
        }),
      });
      if (response.ok) {
        const payload = await response.json() as { messages?: { id?: string }[] };
        const messageId = payload.messages?.[0]?.id;
        if (!messageId) throw new Error("WhatsApp Cloud API returned no message id.");
        return { messageId };
      }
      lastDetail = await response.text();
      if (attempt === 3 || (response.status < 500 && response.status !== 429)) {
        throw new Error(`WhatsApp Cloud API request failed (${response.status}): ${lastDetail}`);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    }
    throw new Error(`WhatsApp Cloud API request failed after retries: ${lastDetail}`);
  }
}

export function createWhatsAppCloudProviderFromEnv() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_API_VERSION;
  if (!accessToken || !phoneNumberId || !graphVersion) {
    throw new Error("Missing WhatsApp Cloud API environment variables.");
  }
  return new WhatsAppCloudProvider(accessToken, phoneNumberId, graphVersion);
}

export function whatsappAutomaticReplyEnabled() {
  return process.env.WHATSAPP_AUTO_REPLY_ENABLED === "true";
}

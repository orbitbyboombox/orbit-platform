import type { GoogleGmailLiveProvider, GoogleGmailProviderMessage } from "../provider/google-gmail-live.provider";
import {
  buildPreEventReminderText,
  formatPreEventDate,
  renderPreEventReminderHtml,
  type PreEventReminderModel,
} from "./pre-event-reminder.template.ts";

export const D10_ADMIN_TEST_RECIPIENT = "matias.maira.larrain@gmail.com";
export const D10_ADMIN_TEST_SUBJECT = "PRUEBA D-10 · BOOMBOX";
export const D10_ADMIN_TEST_LOG_TYPE = "PRE_EVENT_REMINDER_ADMIN_TEST";

function chileDate(reference: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).formatToParts(reference);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function adminD10TestEventDate(reference = new Date()) {
  const date = new Date(`${chileDate(reference)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 10);
  return date.toISOString().slice(0, 10);
}

function modelForTest(reference: Date): PreEventReminderModel {
  return {
    customerName: "Matías Maira Larraín",
    eventName: "PRUEBA D-10 · BOOMBOX",
    eventDate: adminD10TestEventDate(reference),
    daysUntilEvent: 10,
    eventLocation: "Prueba administrativa interna",
    serviceStartAt: null,
    operatorArrivalAt: null,
    assemblyStartAt: null,
    reservationConfirmed: true,
    scrapbookIncluded: false,
    photoDesignRequired: false,
    photoDesignApproved: false,
    photoDesignPending: false,
    payment: null,
    bankCopyUrl: null,
    website: "https://www.boom-box.cl",
  };
}

/** Builds the approved premium D-10 template from synthetic values only. */
export function buildAdminD10TestMessage(requestKey: string, reference = new Date()) {
  const model = modelForTest(reference);
  const message: GoogleGmailProviderMessage = {
    to: D10_ADMIN_TEST_RECIPIENT,
    subject: D10_ADMIN_TEST_SUBJECT,
    textBody: buildPreEventReminderText(model),
    htmlBody: renderPreEventReminderHtml(model),
    driveFileIds: [],
    idempotencyKey: requestKey,
  };
  return {
    ...message,
    eventDate: model.eventDate,
    body: message.textBody,
  };
}

/** Sends only through the injected ORBIT Gmail provider and requires a Gmail receipt. */
export async function sendAdminD10TestMessage(
  sender: Pick<GoogleGmailLiveProvider, "send">,
  requestKey: string,
  reference = new Date(),
) {
  const message = buildAdminD10TestMessage(requestKey, reference);
  const delivered = await sender.send(message);
  if (!delivered.messageId?.trim()) throw new Error("GMAIL_CONFIRMATION_MISSING");
  return { ...message, providerMessageId: delivered.messageId, threadId: delivered.threadId };
}

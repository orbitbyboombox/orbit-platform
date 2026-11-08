import { isWeddingCollectionDue } from "./wedding-collection-due.ts";

export type D10AutoEvent = {
  projectId: string;
  projectType: string;
  eventDate: string | null;
  status: string;
  outstandingBalance: number;
  customerEmail: string | null;
  confirmed: boolean;
  readyDetailsComplete: boolean;
};
export type D10Communication = {
  projectId: string;
  type: "EVENT_READY_D10" | "COLLECTION_D10";
  status: "QUEUED" | "PENDING" | "SENT" | "FAILED";
};

/** Read-only eligibility plan. The delivery worker must atomically claim each
 * project/type/event-date key before Gmail is called. A FAILED or uncertain
 * delivery requires manual reconciliation, never automatic retry.
 */
export function planD10AutoEmails(
  event: D10AutoEvent,
  today: string,
  communications: readonly D10Communication[],
) {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(event.eventDate ?? "");
  const days = validDate
    ? Math.round((Date.parse(event.eventDate! + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000)
    : NaN;
  const validCalendarDay = validDate && Number.isFinite(days) && new Date(event.eventDate! + "T00:00:00Z").toISOString().slice(0, 10) === event.eventDate;
  const eligible = validCalendarDay && event.confirmed &&
    Boolean(event.customerEmail?.trim()) &&
    !["CANCELLED", "ARCHIVED", "DELETED"].includes(event.status.toUpperCase()) &&
    Number.isFinite(days) && days === 10;
  const blocked = (type: D10Communication["type"]) =>
    communications.some(item => item.projectId === event.projectId &&
      item.type === type && ["QUEUED", "PENDING", "SENT", "FAILED"].includes(item.status));
  return {
    eventReady: eligible && event.readyDetailsComplete && !blocked("EVENT_READY_D10"),
    collection: eligible && isWeddingCollectionDue(event, today) && !blocked("COLLECTION_D10"),
  };
}

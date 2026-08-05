import type { CalendarSyncRecord } from "../../types";

export interface CalendarSyncRepository {
  findBySyncRequestId(syncRequestId: string): Promise<CalendarSyncRecord | null>;
  save(record: CalendarSyncRecord): Promise<CalendarSyncRecord>;
}

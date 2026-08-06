import type { GoogleCalendarSyncRecord } from "../types/google-calendar-live.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GoogleCalendarSyncRepository {
  findByOrbitEventId(orbitEventId: string): Promise<GoogleCalendarSyncRecord | null>;
  save(record: GoogleCalendarSyncRecord): Promise<GoogleCalendarSyncRecord>;
}

export class SupabaseGoogleCalendarSyncRepository implements GoogleCalendarSyncRepository {
  constructor(private readonly client: SupabaseClient) {}
  async findByOrbitEventId(orbitEventId: string): Promise<GoogleCalendarSyncRecord | null> {
    const { data, error } = await this.client.from("calendar_sync").select("*").eq("orbit_event_id", orbitEventId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { orbitEventId: data.orbit_event_id, sourceEventId: data.project_id, planId: data.project_id, status: data.status, googleEventId: data.external_event_id ?? undefined, googleEventUrl: data.external_url ?? undefined, sourceFingerprint: data.payload_hash ?? "", lastSynchronization: data.last_synced_at ?? undefined, errorMessage: data.last_error?.message } as GoogleCalendarSyncRecord;
  }
  async save(record: GoogleCalendarSyncRecord): Promise<GoogleCalendarSyncRecord> {
    const { error } = await this.client.from("calendar_sync").upsert({ project_id: record.sourceEventId, orbit_event_id: record.orbitEventId, external_event_id: record.googleEventId, external_url: record.googleEventUrl, status: record.status, payload_hash: record.sourceFingerprint, last_synced_at: record.lastSynchronization, last_error: record.errorMessage ? { message: record.errorMessage } : null }, { onConflict: "orbit_event_id" });
    if (error) throw error;
    return record;
  }
}

export class InMemoryGoogleCalendarSyncRepository implements GoogleCalendarSyncRepository {
  private readonly records = new Map<string, GoogleCalendarSyncRecord>();

  async findByOrbitEventId(orbitEventId: string): Promise<GoogleCalendarSyncRecord | null> {
    return this.records.get(orbitEventId) ?? null;
  }

  async save(record: GoogleCalendarSyncRecord): Promise<GoogleCalendarSyncRecord> {
    this.records.set(record.orbitEventId, record);
    return record;
  }
}

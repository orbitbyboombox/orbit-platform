import type { GoogleCalendarSyncRecord } from "../types/google-calendar-live.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { usesNOVAGoogleCore } from "@/features/connectors/google-workspace/application/google-nova-config";

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
    const nova = usesNOVAGoogleCore();
    return { orbitEventId: data.orbit_event_id, sourceEventId: data.project_id, planId: data.project_id, status: data.status, googleEventId: (nova ? data.nova_external_event_id : data.external_event_id) ?? undefined, googleEventUrl: (nova ? data.nova_external_url : data.external_url) ?? undefined, calendarId: nova ? data.nova_calendar_id ?? undefined : undefined, sourceFingerprint: data.payload_hash ?? "", lastSynchronization: data.last_synced_at ?? undefined, errorMessage: data.last_error?.message, currentPayloadHash: data.current_payload_hash ?? undefined, lastSyncedPayloadHash: data.last_synced_payload_hash ?? undefined, retryCount: data.retry_count ?? 0, nextRetryAt: data.next_retry_at ?? undefined, syncStartedAt: data.sync_started_at ?? undefined, errorCode: data.last_error_code ?? undefined, approvedRemotePayloadHash: data.approved_remote_payload_hash ?? undefined, approvedRemoteSourceHash: data.approved_remote_source_hash ?? undefined, approvedRemoteEtag: data.approved_remote_etag ?? undefined, approvedRemoteSnapshot: data.approved_remote_snapshot ?? undefined, approvedRemoteAt: data.approved_remote_at ?? undefined, approvedRemoteBy: data.approved_remote_by ?? undefined } as GoogleCalendarSyncRecord;
  }
  async save(record: GoogleCalendarSyncRecord): Promise<GoogleCalendarSyncRecord> {
    const nova = usesNOVAGoogleCore();
    const providerFields = nova
      ? { nova_external_event_id: record.googleEventId, nova_external_url: record.googleEventUrl, nova_calendar_id: record.calendarId, nova_migration_status: record.googleEventId ? "MIGRATED" : "PENDING", nova_migrated_at: record.googleEventId ? new Date().toISOString() : null, nova_migration_error: null }
      : { external_event_id: record.googleEventId, external_url: record.googleEventUrl };
    const { error } = await this.client.from("calendar_sync").upsert({ project_id: record.sourceEventId, orbit_event_id: record.orbitEventId, ...providerFields, status: record.status, payload_hash: record.sourceFingerprint, current_payload_hash: record.currentPayloadHash ?? record.sourceFingerprint, last_synced_payload_hash: record.lastSyncedPayloadHash ?? (record.status === "SYNCHRONIZED" ? record.sourceFingerprint : null), retry_count: record.retryCount ?? 0, next_retry_at: record.nextRetryAt ?? null, sync_started_at: record.syncStartedAt ?? null, last_error_code: record.errorCode ?? null, last_synced_at: record.lastSynchronization, last_error: record.errorMessage ? { message: record.errorMessage } : null, approved_remote_payload_hash: record.approvedRemotePayloadHash ?? null, approved_remote_source_hash: record.approvedRemoteSourceHash ?? null, approved_remote_etag: record.approvedRemoteEtag ?? null, approved_remote_snapshot: record.approvedRemoteSnapshot ?? null, approved_remote_at: record.approvedRemoteAt ?? null, approved_remote_by: record.approvedRemoteBy ?? null }, { onConflict: "orbit_event_id" });
    if (error) throw error;
    return record;
  }
}

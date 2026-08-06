import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppendTimelineEvent, TimelineEvent, TimelineRepository, TimelineSource } from "./timeline.repository";

interface TimelineRow {
  id: string; orbit_event_id: string; occurred_at: string; actor_id: string | null; actor_label: string;
  source: TimelineSource; action: TimelineEvent["action"]; entity_type: string; entity_id: string;
  customer_id: string | null; project_id: string | null; staff_id: string | null;
  communication_id: string | null; agreement_id: string | null; calendar_sync_id: string | null;
  previous_state: string | null; new_state: string | null; human_message: string; correlation_id: string;
}

const SELECT = "id,orbit_event_id,occurred_at,actor_id,actor_label,source,action,entity_type,entity_id,customer_id,project_id,staff_id,communication_id,agreement_id,calendar_sync_id,previous_state,new_state,human_message,correlation_id";

function toDomain(row: TimelineRow): TimelineEvent {
  return {
    id: row.id, orbitEventId: row.orbit_event_id, occurredAt: row.occurred_at,
    actorId: row.actor_id ?? undefined, actorLabel: row.actor_label, source: row.source,
    action: row.action, entityType: row.entity_type, entityId: row.entity_id,
    customerId: row.customer_id ?? undefined, projectId: row.project_id ?? undefined,
    staffId: row.staff_id ?? undefined, communicationId: row.communication_id ?? undefined,
    agreementId: row.agreement_id ?? undefined, calendarSyncId: row.calendar_sync_id ?? undefined,
    previousState: row.previous_state ?? undefined, newState: row.new_state ?? undefined,
    humanMessage: row.human_message, correlationId: row.correlation_id,
  };
}

export class SupabaseTimelineRepository implements TimelineRepository {
  constructor(private readonly client: SupabaseClient) {}

  async append(event: AppendTimelineEvent): Promise<TimelineEvent> {
    const { data, error } = await this.client.from("timeline_events").insert({
      orbit_event_id: event.orbitEventId, occurred_at: event.occurredAt,
      actor_id: event.actorId, created_by: event.actorId, actor_label: event.actorLabel,
      source: event.source, event_type: event.action, action: event.action,
      entity_type: event.entityType, entity_id: event.entityId,
      customer_id: event.customerId, project_id: event.projectId, staff_id: event.staffId,
      communication_id: event.communicationId, agreement_id: event.agreementId,
      calendar_sync_id: event.calendarSyncId, previous_state: event.previousState,
      new_state: event.newState, title: event.humanMessage, description: event.humanMessage,
      human_message: event.humanMessage, correlation_id: event.correlationId,
    }).select(SELECT).single();
    if (error) throw error;
    return toDomain(data as TimelineRow);
  }

  findByCustomer = (id: string) => this.find("customer_id", id);
  findByProject = (id: string) => this.find("project_id", id);
  findByStaff = (id: string) => this.find("staff_id", id);
  findByCommunication = (id: string) => this.find("communication_id", id);
  findByAgreement = (id: string) => this.find("agreement_id", id);
  findByCalendarSync = (id: string) => this.find("calendar_sync_id", id);

  private async find(column: string, id: string): Promise<readonly TimelineEvent[]> {
    const { data, error } = await this.client.from("timeline_events").select(SELECT).eq(column, id).order("occurred_at", { ascending: false }).order("id", { ascending: false });
    if (error) throw error;
    return (data as TimelineRow[]).map(toDomain);
  }
}

export const TIMELINE_EVENT_TYPES = [
  "CUSTOMER_CREATED", "CUSTOMER_UPDATED", "QUOTATION_CREATED", "QUOTATION_UPDATED",
  "PORTAL_CREATED", "CONTRACT_GENERATED", "CONTRACT_SIGNED", "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED", "STAFF_ASSIGNED", "STAFF_ACCEPTED", "STAFF_REJECTED",
  "MOUNTING_STARTED", "MOUNTING_COMPLETED", "EVENT_STARTED", "EVENT_FINISHED",
  "DISMANTLING_STARTED", "DISMANTLING_COMPLETED", "RETURNED_TO_WAREHOUSE",
  "EXPENSE_REGISTERED", "SUPPLY_UPDATED", "CALENDAR_SYNCHRONIZED", "DRIVE_SYNCHRONIZED",
  "EMAIL_SENT", "HUMAN_HANDOFF", "HUMAN_HANDOFF_RELEASED", "NOVA_RECOMMENDATION",
  "STAFF_ASSISTANCE_REQUESTED", "ARRIVAL_RECORDED",
  "STAFF_CHANGED", "STAFF_REMOVED", "TOTEM_ASSIGNED", "CASE_ASSIGNED", "EQUIPMENT_CHANGED", "EQUIPMENT_RELEASED", "STAFF_PAYMENT_CALCULATED", "PARKING_PAYMENT_APPROVED",
] as const;

export const TIMELINE_SOURCES = [
  "Customer", "NOVA", "Staff", "Operations", "Calendar", "Drive", "Gmail", "System",
  "Administrator", "Google Workspace", "Future Meta",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];
export type TimelineSource = (typeof TIMELINE_SOURCES)[number];

export interface TimelineEvent {
  id: string;
  orbitEventId: string;
  occurredAt: string;
  actorId?: string;
  actorLabel: string;
  source: TimelineSource;
  action: TimelineEventType;
  entityType: string;
  entityId: string;
  customerId?: string;
  projectId?: string;
  staffId?: string;
  communicationId?: string;
  agreementId?: string;
  calendarSyncId?: string;
  previousState?: string;
  newState?: string;
  humanMessage: string;
  correlationId: string;
}

export type AppendTimelineEvent = Omit<TimelineEvent, "id" | "occurredAt"> & { occurredAt?: string };

export interface TimelineRepository {
  append(event: AppendTimelineEvent): Promise<TimelineEvent>;
  findByCustomer(customerId: string): Promise<readonly TimelineEvent[]>;
  findByProject(projectId: string): Promise<readonly TimelineEvent[]>;
  findByStaff(staffId: string): Promise<readonly TimelineEvent[]>;
  findByCommunication(communicationId: string): Promise<readonly TimelineEvent[]>;
  findByAgreement(agreementId: string): Promise<readonly TimelineEvent[]>;
  findByCalendarSync(calendarSyncId: string): Promise<readonly TimelineEvent[]>;
}

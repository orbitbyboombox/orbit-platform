export type ActorId = string;

export interface AuditMetadata {
  createdBy: ActorId;
  createdAt: string;
  modifiedBy?: ActorId;
  modifiedAt?: string;
}

export interface ApprovalMetadata {
  approvedBy: ActorId;
  approvedAt: string;
  reason: string;
}

export interface AuditEvent<TAction extends string = string, TPayload = unknown> {
  id: string;
  entityId: string;
  entityType: string;
  action: TAction;
  actorId: ActorId;
  occurredAt: string;
  reason?: string;
  payload?: Readonly<TPayload>;
}

export type OrbitRole = "CEO" | "ADMINISTRATOR" | "OPERATIONS" | "STAFF" | "SALES" | "CUSTOMER" | "READONLY";

export type PermissionAction = "CREATE" | "READ" | "UPDATE" | "APPROVE" | "CANCEL" | "EXPORT";

export interface PermissionRequest {
  actorId: string;
  role: OrbitRole;
  action: PermissionAction;
  resource: string;
  resourceId?: string;
}

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
}

export interface PermissionPolicy {
  evaluate(request: PermissionRequest): PermissionDecision;
}

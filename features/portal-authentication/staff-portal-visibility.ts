export type PortalStaffVisibilityState = "AVAILABLE" | "ASSIGNED" | "HIDDEN_VALID" | "ERROR";
export type PortalStaffVisibility = {state: PortalStaffVisibilityState; reason: string};

/** Side-effect-free visibility contract shared by Staff portal readers. */
export function portalStaffVisibility(input: {
  published: boolean;
  deletedAt?: string | null;
  projectStatus?: string | null;
  inOperationalWindow: boolean;
  assignedToStaff: boolean;
  hasEligibleRole: boolean;
  hasPublishedRequirement: boolean;
}): PortalStaffVisibility {
  if (input.deletedAt || ["CANCELLED", "ARCHIVED", "CLOSED", "COMPLETED", "COMPLETED_EVENT"].includes(String(input.projectStatus ?? "").toUpperCase())) return {state: "HIDDEN_VALID", reason: "PROJECT_CLOSED_OR_DELETED"};
  if (!input.published) return {state: "HIDDEN_VALID", reason: "NOT_PUBLISHED"};
  if (!input.inOperationalWindow) return {state: "HIDDEN_VALID", reason: "DATE_FILTERED"};
  if (input.assignedToStaff) return {state: "ASSIGNED", reason: "ACTIVE_ASSIGNMENT"};
  if (!input.hasPublishedRequirement) return {state: "AVAILABLE", reason: "PUBLISHED_WITHOUT_REQUIREMENT"};
  if (input.hasEligibleRole) return {state: "AVAILABLE", reason: "ELIGIBLE_ROLE_AVAILABLE"};
  return {state: "HIDDEN_VALID", reason: "NO_ELIGIBLE_ROLE_FOR_STAFF"};
}

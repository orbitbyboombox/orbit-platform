export type ResponsibilityRequirement = {
  role: string;
  required: number;
  published: boolean;
};

export type ResponsibilityAssignment = {
  role: string;
  status: string;
  staffName: string;
};

export type ResponsibilityRequest = {
  role: string;
  staffName: string;
};

export type ResponsibilityReadModel = ResponsibilityRequirement & {
  assignedStaff: string[];
  pendingStaff: string[];
  remaining: number;
  status: "ASSIGNED" | "PENDING" | "VACANT";
};

const INACTIVE_ASSIGNMENT_STATUSES = new Set(["CANCELLED", "REJECTED"]);

/** Builds the Founder responsibility projection from canonical ownership first. */
export function buildResponsibilityReadModel(
  requirements: ResponsibilityRequirement[],
  assignments: ResponsibilityAssignment[],
  requests: ResponsibilityRequest[],
): ResponsibilityReadModel[] {
  return requirements.map((requirement) => {
    const assignedStaff = [
      ...new Set(
        assignments
          .filter(
            (assignment) =>
              assignment.role === requirement.role &&
              !INACTIVE_ASSIGNMENT_STATUSES.has(assignment.status) &&
              assignment.staffName.trim(),
          )
          .map((assignment) => assignment.staffName.trim()),
      ),
    ];
    const pendingStaff = [
      ...new Set(
        requests
          .filter(
            (request) =>
              request.role === requirement.role &&
              request.staffName.trim() &&
              !assignedStaff.includes(request.staffName.trim()),
          )
          .map((request) => request.staffName.trim()),
      ),
    ];
    const remaining = Math.max(
      requirement.required - assignedStaff.length,
      0,
    );
    return {
      ...requirement,
      assignedStaff,
      pendingStaff,
      remaining,
      status:
        assignedStaff.length > 0
          ? "ASSIGNED"
          : pendingStaff.length > 0
            ? "PENDING"
            : "VACANT",
    };
  });
}

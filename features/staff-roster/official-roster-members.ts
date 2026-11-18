export const rosterRoles = {
  OPERATOR: { title: "Operadores", label: "Operador" },
  ASSEMBLY: { title: "Montaje", label: "Montaje" },
  DISASSEMBLY: { title: "Desmontaje", label: "Desmontaje" },
  SUPERVISOR: { title: "Supervisores", label: "Supervisor" },
} as const;

type RosterRole = keyof typeof rosterRoles;
type StaffIdentity = { first_name: string | null; last_name: string | null; rut: string | null };
type Assignment = {
  id: string;
  staff_id: string;
  assignment_type: string;
  status: string;
  staff: StaffIdentity | StaffIdentity[] | null;
};

export type RosterMember = {
  assignmentId: string;
  staffId: string;
  name: string;
  rut: string;
  status: string;
};

export function buildRosterGroups(assignments: Assignment[]) {
  const active = assignments.filter(row => !["CANCELLED", "REJECTED", "DELETED"].includes(row.status.toUpperCase()));
  const operators = new Map<string, string>();
  const groups = (Object.keys(rosterRoles) as RosterRole[]).map(role => {
    const byStaff = new Map<string, RosterMember>();
    for (const row of active) {
      if (row.assignment_type !== role) continue;
      const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
      const name = [staff?.first_name, staff?.last_name].map(part => part?.trim()).filter(Boolean).join(" ");
      if (role === "OPERATOR" && name) operators.set(row.id, name);
      if (byStaff.has(row.staff_id)) continue;
      byStaff.set(row.staff_id, {
        assignmentId: row.id,
        staffId: row.staff_id,
        name,
        rut: staff?.rut ?? "",
        status: row.status,
      });
    }
    return {
      role,
      ...rosterRoles[role],
      members: [...byStaff.values()].sort((a, b) => a.name.localeCompare(b.name, "es") || a.staffId.localeCompare(b.staffId)),
    };
  });
  return { groups, operators };
}

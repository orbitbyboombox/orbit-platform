export const CANONICAL_BOX_CODES = Array.from(
  { length: 9 },
  (_, index) => `CASE-${String(index + 1).padStart(2, "0")}`,
);

const CANONICAL_BOX_CODE_SET = new Set(CANONICAL_BOX_CODES);

type AssetLike = { asset_code?: string | null; asset_type?: string | null };
type AssignmentLike = {
  id?: string | null;
  project_id?: string | null;
  assignment_status?: string | null;
  deleted_at?: string | null;
  assigned_at?: string | null;
  returned_at?: string | null;
  operational_assets?: AssetLike | AssetLike[] | null;
};

const activeAssignmentStatuses = new Set(["ASSIGNED", "CONFIRMED", "ACCEPTED", "IN_EVENT"]);

function assignmentRank(row: AssignmentLike): [number, number] {
  const active = activeAssignmentStatuses.has(String(row.assignment_status ?? "").toUpperCase()) ? 1 : 0;
  const timestamp = Date.parse(String(row.assigned_at ?? row.returned_at ?? "")) || 0;
  return [active, timestamp];
}

export function assignedBoxCode(row: AssignmentLike): string | null {
  if (row.assignment_status !== "ASSIGNED" || row.deleted_at) return null;
  const asset = Array.isArray(row.operational_assets) ? row.operational_assets[0] : row.operational_assets;
  const code = asset?.asset_code?.trim().toUpperCase();
  if (!code || !CANONICAL_BOX_CODE_SET.has(code)) return null;
  const type = asset?.asset_type?.trim().toUpperCase();
  if (type && type !== "BOX" && type !== "CASE") return null;
  return code;
}

export function buildAssignedBoxByProject(rows: AssignmentLike[]): Map<string, string> {
  const result = new Map<string, string>();
  const byProject = new Map<string, AssignmentLike[]>();
  for (const row of rows) {
    if (!row.project_id) continue;
    const projectRows = byProject.get(row.project_id) ?? [];
    projectRows.push(row);
    byProject.set(row.project_id, projectRows);
  }
  for (const [projectId, projectRows] of byProject) {
    const canonical = [...projectRows]
      .filter((row) => !row.deleted_at)
      .sort((left, right) => {
        const [leftActive, leftTime] = assignmentRank(left);
        const [rightActive, rightTime] = assignmentRank(right);
        return rightActive - leftActive || rightTime - leftTime;
      })[0];
    const code = canonical ? assignedBoxCode({ ...canonical, assignment_status: "ASSIGNED" }) : null;
    if (code) result.set(projectId, code);
  }
  return result;
}

export function formatAssignedBoxLabel(code: string | null | undefined): string {
  const normalized = code?.trim().toUpperCase() ?? "";
  if (!CANONICAL_BOX_CODE_SET.has(normalized)) return "Caja pendiente de asignar";
  const number = Number(normalized.slice("CASE-".length));
  return `Caja ${number} · ${normalized}`;
}

export function formatEventBoxLabel(code: string | null | undefined, confirmedUsage?: number | null): string {
  const label = formatAssignedBoxLabel(code);
  return label === "Caja pendiente de asignar" || confirmedUsage == null
    ? label
    : `${label} — Cierre confirmado — ${confirmedUsage} fotografías utilizadas`;
}

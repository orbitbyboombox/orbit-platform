export const CANONICAL_BOX_CODES = Array.from(
  { length: 9 },
  (_, index) => `CASE-${String(index + 1).padStart(2, "0")}`,
);

const CANONICAL_BOX_CODE_SET = new Set(CANONICAL_BOX_CODES);

type AssetLike = { asset_code?: string | null; asset_type?: string | null };
type AssignmentLike = {
  project_id?: string | null;
  assignment_status?: string | null;
  deleted_at?: string | null;
  operational_assets?: AssetLike | AssetLike[] | null;
};

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
  for (const row of rows) {
    const code = assignedBoxCode(row);
    if (row.project_id && code && !result.has(row.project_id)) result.set(row.project_id, code);
  }
  return result;
}

export function formatAssignedBoxLabel(code: string | null | undefined): string {
  const normalized = code?.trim().toUpperCase() ?? "";
  if (!CANONICAL_BOX_CODE_SET.has(normalized)) return "Caja pendiente de asignar";
  const number = Number(normalized.slice("CASE-".length));
  return `Caja ${number} · ${normalized}`;
}

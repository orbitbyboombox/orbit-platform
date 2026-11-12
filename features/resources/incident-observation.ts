export type IncidentObservation = {
  id: string; projectId: string; box: string; observation: string; event: string;
  staff: string; status: string; resolution: string; createdAt: string;
};
export function isNoIssueObservation(value: string) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[.!]+$/g, '').trim();
  return ['nada', 'ninguna', 'ninguno', 'sin novedad', 'sin novedades', 'sin observaciones', 'sin problemas', 'todo bien', 'todo ok', 'no hay observaciones', 'no hay problemas', 'n/a', '-'].includes(normalized);
}
export function incidentBoxLabel(code: unknown) {
  if (typeof code !== 'string' || !code.trim()) return 'Caja no registrada';
  const match = code.match(/^CASE-0*(\d+)$/i);
  return match ? `Caja ${Number(match[1])}` : code;
}
function relation(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === 'object' ? row as Record<string, unknown> : {};
}
export function mapIncidentObservation(row: Record<string, unknown>, metadata: Record<string, unknown> = {}): IncidentObservation {
  const asset = relation(row.operational_assets), project = relation(row.projects), staff = relation(row.staff);
  return {
    id: String(row.id), projectId: String(row.project_id ?? ''),
    box: incidentBoxLabel(asset.asset_code ?? metadata.box_code),
    observation: String(row.description ?? metadata.report ?? ''),
    event: String(project.name ?? metadata.event_name ?? 'Evento no registrado'),
    staff: [staff.first_name, staff.last_name].filter(Boolean).join(' ') || String(metadata.staff_name ?? ''),
    status: String(row.status ?? ''), resolution: String(row.resolution ?? ''), createdAt: String(row.created_at ?? ''),
  };
}

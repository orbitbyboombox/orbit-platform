'use server';
import { revalidatePath } from 'next/cache';
import { requireDiagnosticAdmin } from './diagnostics.service';
export async function recordIncidentResolution(incidentId: string, resolution: string) {
  try {
    const { client } = await requireDiagnosticAdmin();
    if (!/^[\da-f-]{36}$/i.test(incidentId) || resolution.trim().length < 10 || resolution.length > 2000) throw new Error('Describe la reparación realizada (10 a 2000 caracteres).');
    const incident = await client.from('event_incidents').select('project_id,status').eq('id', incidentId).maybeSingle();
    if (incident.error || !incident.data) throw new Error('No fue posible verificar la incidencia.');
    if (incident.data.status === 'RESOLVED') return { ok: true as const };
    const { error } = await client.rpc('resolve_staff_operator_incident', { p_incident_id: incidentId, p_resolution: resolution.trim() });
    if (error) throw error;
    revalidatePath(`/projects/${incident.data.project_id}`);
    revalidatePath('/operations'); revalidatePath('/', 'layout');
    revalidatePath(`/resources/boxes/incidents/${incidentId}`);
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'No fue posible registrar la resolución.' }; }
}

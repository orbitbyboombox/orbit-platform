import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireDiagnosticAdmin } from '@/features/founder-action-center/diagnostics.service';
import { IncidentResolution } from '@/features/founder-action-center/incident-resolution';
export const dynamic = 'force-dynamic';
export default async function BoxIncidentPage({ params }: { params: Promise<{incidentId: string}> }) {
  await requireDiagnosticAdmin();
  const { incidentId } = await params;
  if (!/^[\da-f-]{36}$/i.test(incidentId)) notFound();
  const result = await createAdminClient().from('event_incidents').select('id,status,description,resolution,projects(name,orbit_event_id),operational_assets(asset_code)').eq('id', incidentId).maybeSingle();
  if (result.error) throw new Error('No fue posible cargar la incidencia.');
  if (!result.data) notFound();
  const incident = result.data;
  const project = Array.isArray(incident.projects) ? incident.projects[0] : incident.projects;
  const asset = Array.isArray(incident.operational_assets) ? incident.operational_assets[0] : incident.operational_assets;
  const notification = await createAdminClient().from('internal_notifications').select('metadata').eq('notification_type', 'STAFF_OPERATOR_INCIDENT').eq('entity_id', incidentId).limit(1);
  if (notification.error) throw new Error('No fue posible verificar la caja del reporte.');
  const metadata = (notification.data?.[0]?.metadata ?? {}) as Record<string, unknown>;
  const boxLabel = asset?.asset_code ?? (typeof metadata.box_code === 'string' ? metadata.box_code : 'Caja no registrada en el reporte');
  return <main className="mx-auto w-full min-w-0 max-w-3xl p-4 sm:p-6"><Link href="/operations" className="inline-flex min-h-11 items-center text-sm text-brand">Volver a pendientes</Link><h1 className="mt-3 text-2xl font-semibold">Incidencia de caja / equipo</h1><dl className="mt-5 grid gap-4 rounded-xl border p-4 text-sm"><div><dt className="text-muted">Evento</dt><dd className="mt-1">{project?.name ?? 'No registrado'} · {project?.orbit_event_id}</dd></div><div><dt className="text-muted">Caja</dt><dd className="mt-1">{boxLabel}</dd></div><div><dt className="text-muted">Reporte exacto</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{incident.description}</dd></div>{incident.resolution ? <div><dt className="text-muted">Resolución registrada</dt><dd className="mt-1 whitespace-pre-wrap break-words">{incident.resolution}</dd></div> : null}</dl><IncidentResolution id={incident.id} resolved={incident.status === 'RESOLVED'} /></main>;
}

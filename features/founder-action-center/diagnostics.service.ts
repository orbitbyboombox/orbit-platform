import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFinanceDashboardReadModel } from '@/features/finance/finance-read-model';
import { diagnosticSolution, operationalTarget, safeActionHref, isPhysicalConfigurationReady, type ActionDiagnostic } from './diagnostic-model';

export async function requireDiagnosticAdmin() {
  const client = await createSupabaseServerClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw new Error('Sesión requerida.');
  const profile = await client.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
  if (profile.error || !['CEO', 'ADMINISTRATOR'].includes(profile.data?.role ?? '')) throw new Error('Acceso administrativo requerido.');
  return { client, userId: auth.user.id };
}

export async function loadActionDiagnostic(id: string): Promise<ActionDiagnostic> {
  const { client } = await requireDiagnosticAdmin();
  const checkedAt = new Date().toISOString();
  const base = { id, event: 'No corresponde a un evento', box: 'No aplica', checkedAt };
  if (id.startsWith('finance-risk:')) {
    const model = await loadFinanceDashboardReadModel(client);
    const risk = model.risks.find(row => row.key === id.slice('finance-risk:'.length));
    return { ...base, title: risk?.label ?? 'Indicador financiero', problem: risk ? `${risk.count} registros · ${risk.detail}` : 'La fuente ya no reporta este pendiente.', solution: diagnosticSolution('FINANCE_RISK'), resolved: !risk, targets: risk ? [{ label: 'Ver registros del indicador', href: safeActionHref(risk.href) }] : [] };
  }
  const admin = createAdminClient();
  if (id.startsWith('founder-action:invoice:')) {
    const invoice = await admin.from('accounts_receivable_projection').select('id,invoice_number,outstanding_balance,effective_status,due_date,projects(name)').eq('id', id.slice('founder-action:invoice:'.length)).maybeSingle();
    if (invoice.error || !invoice.data) throw new Error('No fue posible verificar la factura.');
    const row = invoice.data, project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    return { ...base, event: project?.name ?? base.event, title: `Factura ${row.invoice_number}`, problem: `Saldo: ${Number(row.outstanding_balance).toLocaleString('es-CL')} · Vencimiento: ${row.due_date}`, solution: diagnosticSolution('INVOICE_OVERDUE'), resolved: Number(row.outstanding_balance) <= 0 || ['PAID','CANCELLED','ARCHIVED','VOID'].includes(row.effective_status) || Boolean(row.due_date && row.due_date >= new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())), targets: [{ label: 'Abrir factura', href: `/finance/receivables?invoice=${encodeURIComponent(row.id)}` }] };
  }
  if (!/^[\da-f-]{36}$/i.test(id)) throw new Error('Pendiente inválido.');
  const notification = await admin.from('internal_notifications').select('id,notification_type,title,message,status,action_required,project_id,entity_id,related_href,metadata,projects(name,orbit_event_id,operations)').eq('id', id).maybeSingle();
  if (notification.error || !notification.data) throw new Error('No fue posible verificar el pendiente.');
  const row = notification.data, meta = (row.metadata ?? {}) as Record<string, unknown>;
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
  let resolved = row.status === 'RESOLVED' || !row.action_required;
  let problem = row.message || row.title;
  let box = typeof meta.box_code === 'string' ? meta.box_code : row.notification_type === 'STAFF_OPERATOR_INCIDENT' ? 'Caja no registrada en el reporte' : 'No aplica';
  let targets = [{ label: 'Abrir módulo correspondiente', href: safeActionHref(row.related_href) }];
  if (row.notification_type === 'STAFF_OPERATOR_INCIDENT') {
    const incident = await admin.from('event_incidents').select('id,status,description,asset_id,operational_assets(asset_code)').eq('id', row.entity_id).maybeSingle();
    if (incident.error || !incident.data) throw new Error('No fue posible verificar la incidencia.');
    const asset = Array.isArray(incident.data.operational_assets) ? incident.data.operational_assets[0] : incident.data.operational_assets;
    box = asset?.asset_code ?? box;
    problem = incident.data.description;
    resolved = incident.data.status === 'RESOLVED';
    targets = [{ label: 'Revisar y registrar reparación', href: `/resources/boxes/incidents/${encodeURIComponent(incident.data.id)}#resolution` }];
  } else if (row.notification_type === 'EVENT_NOT_READY' && row.project_id) {
    const contract = await admin.from('project_operational_contracts').select('readiness_status,readiness_reasons').eq('project_id', row.project_id).maybeSingle();
    if (contract.error || !contract.data) throw new Error('No fue posible verificar los requisitos actuales.');
    const reasons = (Array.isArray(contract.data.readiness_reasons) ? contract.data.readiness_reasons : []) as {code: string; label: string}[];
    problem = reasons.map(reason => reason.label).join('\n') || row.message;
    resolved = contract.data.readiness_status === 'READY';
    targets = reasons.map(reason => ({ label: reason.label, href: operationalTarget(row.project_id, reason.code) }));
  } else if (row.notification_type === 'PHYSICAL_CONFIGURATION_MISSING' && row.project_id) {
    const operations = (project?.operations ?? {}) as Record<string, unknown>;
    resolved = isPhysicalConfigurationReady(operations.physicalConfiguration);
    targets = [{ label: 'Definir configuración física', href: `/projects/${encodeURIComponent(row.project_id)}?eventTab=OPERATION&focusField=physicalConfiguration#physical-resource-planning` }];
  }
  return { ...base, title: row.title, event: project ? `${project.name} · ${project.orbit_event_id ?? ''}` : typeof meta.event_name === 'string' ? meta.event_name : base.event, box, problem, solution: diagnosticSolution(row.notification_type), targets, resolved, checkedAt };
}

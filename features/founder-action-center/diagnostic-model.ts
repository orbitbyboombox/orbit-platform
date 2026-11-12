export type ActionDiagnostic = {
  id: string; title: string; event: string; box: string; problem: string;
  solution: string; targets: { label: string; href: string }[];
  resolved: boolean; checkedAt: string;
};
export function safeActionHref(value: unknown, fallback = '/notifications') {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value) ? value : fallback;
}
export function operationalTarget(projectId: string, code: string) {
  const base = `/projects/${encodeURIComponent(projectId)}`;
  const fields: Record<string, string> = { CONTACT: 'contactFirstName', SCHEDULE: 'serviceStartAt', SHELL: 'shellType' };
  if (fields[code]) return `${base}?eventTab=OPERATION&operationField=${fields[code]}#operations-readiness`;
  if (code === 'DATE' || code === 'LOCATION') return `${base}?eventTab=CLIENT#customer`;
  if (code === 'SERVICES') return `${base}?eventTab=SERVICE#service`;
  if (code === 'CHECKLIST') return `${base}?eventTab=OPERATION#operations-checklist`;
  if (code.startsWith('RESOURCE:')) return `${base}?eventTab=OPERATION#resource-${encodeURIComponent(code.slice(9))}`;
  if (code.includes('STAFF')) return `${base}?eventTab=STAFF#staff-assignment`;
  if (code === 'RESERVATION') return `${base}?eventTab=FINANCE#commercial`;
  return `${base}?eventTab=OPERATION#operations-readiness`;
}
export function diagnosticSolution(type: string) {
  if (type === 'STAFF_OPERATOR_INCIDENT') return 'Revisa el reporte y repara o repone el componente indicado. Registra qué se corrigió en la incidencia; LISTO comprobará su resolución.';
  if (type === 'EVENT_NOT_READY') return 'Completa cada requisito señalado en los campos del evento. Guarda los cambios y vuelve a validar LISTO.';
  if (type === 'PHYSICAL_CONFIGURATION_MISSING') return 'Define la configuración física del evento en Operaciones. No cambies el inventario para descartar este aviso.';
  if (type === 'STAFF_ONBOARDING_REVIEW_REQUIRED') return 'Revisa la ficha y los documentos del operador y completa su revisión en Staff.';
  if (type === 'STAFF_EXPENSE_REVIEW_REQUIRED') return 'Revisa el gasto y sus respaldos en Staff. Este diagnóstico no registra ni modifica pagos.';
  if (type === 'STAFF_BOLETA_REVIEW_REQUIRED') return 'Revisa la boleta y su estado en la cuenta Staff correspondiente.';
  if (type.startsWith('SALES_')) return 'Abre el seguimiento comercial indicado y completa la acción pendiente del cliente.';
  if (type.startsWith('WHATSAPP_')) return 'Revisa la conversación y atiende la acción pendiente en Comunicaciones.';
  if (type === 'INVOICE_OVERDUE') return 'Revisa la factura, su vencimiento y el saldo en el módulo de origen. LISTO solo valida el estado actual.';
  if (type === 'FINANCE_RISK') return 'Revisa los registros que componen este indicador en su módulo. Solo desaparecerá cuando la fuente deje de reportar el problema.';
  return 'Revisa el problema informado en su módulo de origen. Guarda la corrección y valida nuevamente; un aviso activo no se ocultará.';
}
export function canCompleteDiagnostics(rows: readonly ActionDiagnostic[]) {
  return rows.length > 0 && rows.every(row => row.resolved);
}

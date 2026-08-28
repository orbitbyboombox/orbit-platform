export const DASHBOARD_LAYOUT_VERSION = 1 as const;

export const DASHBOARD_KPI_ITEMS = [
  { id: "kpi.cash_registered", label: "Caja registrada" },
  { id: "kpi.total_receivables", label: "Por cobrar total" },
  { id: "kpi.company_credit", label: "Crédito Empresas" },
  { id: "kpi.customer_balances", label: "Saldos Clientes / Eventos" },
  { id: "kpi.month_sales", label: "Ventas del mes" },
  { id: "kpi.operating_result", label: "Resultado operativo" },
  { id: "kpi.operating_margin", label: "Margen operativo" },
  { id: "kpi.events_today", label: "Eventos hoy" },
] as const;

export const DASHBOARD_QUICK_ACTION_ITEMS = [
  { id: "action.new_customer", label: "Nuevo Cliente" },
  { id: "action.new_reservation", label: "Nueva Reserva" },
  { id: "action.quote", label: "Cotizar" },
  { id: "action.new_expense", label: "Ingresar Gasto" },
] as const;

export const DASHBOARD_WIDGET_ITEMS = [
  { id: "widget.financial_alerts", label: "Obligaciones financieras" },
  { id: "widget.staff_approvals", label: "Aprobaciones de Staff pendientes" },
  { id: "widget.action_center", label: "Centro de decisiones" },
  { id: "widget.today_operation", label: "Jornada operacional" },
  { id: "widget.upcoming_events", label: "Próximos eventos" },
  { id: "widget.recent_activity", label: "Actividad reciente" },
  { id: "widget.publication_console", label: "Consola de publicación" },
  { id: "widget.workspace_settings", label: "Configuración del Workspace" },
] as const;

export type DashboardKpiItemKey = (typeof DASHBOARD_KPI_ITEMS)[number]["id"];
export type DashboardQuickActionItemKey =
  (typeof DASHBOARD_QUICK_ACTION_ITEMS)[number]["id"];
export type DashboardWidgetItemKey =
  (typeof DASHBOARD_WIDGET_ITEMS)[number]["id"];

export type DashboardLayout = {
  version: number;
  kpiOrder: DashboardKpiItemKey[];
  quickActionOrder: DashboardQuickActionItemKey[];
  widgetOrder: DashboardWidgetItemKey[];
};

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  version: DASHBOARD_LAYOUT_VERSION,
  kpiOrder: DASHBOARD_KPI_ITEMS.map((item) => item.id),
  quickActionOrder: DASHBOARD_QUICK_ACTION_ITEMS.map((item) => item.id),
  widgetOrder: DASHBOARD_WIDGET_ITEMS.map((item) => item.id),
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function reconcileOrder<T extends string>(
  candidate: unknown,
  canonical: readonly T[],
): T[] {
  const source = isStringArray(candidate)
    ? candidate.filter((item): item is T => canonical.includes(item as T))
    : [];
  const seen = new Set(source);
  return [...source, ...canonical.filter((item) => !seen.has(item))];
}

export function reconcileDashboardLayout(value: unknown): DashboardLayout {
  const stored =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    version:
      typeof stored.version === "number" && stored.version > 0
        ? stored.version
        : DASHBOARD_LAYOUT_VERSION,
    kpiOrder: reconcileOrder(stored.kpiOrder, DEFAULT_DASHBOARD_LAYOUT.kpiOrder),
    quickActionOrder: reconcileOrder(
      stored.quickActionOrder,
      DEFAULT_DASHBOARD_LAYOUT.quickActionOrder,
    ),
    widgetOrder: reconcileOrder(
      stored.widgetOrder,
      DEFAULT_DASHBOARD_LAYOUT.widgetOrder,
    ),
  };
}

export function resetDashboardLayout(): DashboardLayout {
  return structuredClone(DEFAULT_DASHBOARD_LAYOUT);
}

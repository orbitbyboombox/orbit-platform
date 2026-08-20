import type { LucideIcon } from "lucide-react";
import type { NavigationKey } from "@/components/layout/navigation";
import {
  BarChart3,
  CalendarDays,
  Car,
  ChartNoAxesCombined,
  CircleDollarSign,
  Clock3,
  Contact,
  FilePlus2,
  Fuel,
  Handshake,
  ReceiptText,
  ScrollText,
  UsersRound,
  WalletCards,
} from "lucide-react";

export const QUICK_ACTIONS = [
  {
    key: "NEW_RESERVATION",
    label: "Nueva Reserva",
    href: "/projects?reservation=new",
    icon: FilePlus2,
    module: "BOOKING_EXPERIENCE",
  },
  {
    key: "CUSTOMERS",
    label: "Clientes",
    href: "/customers",
    icon: Contact,
    module: "PROJECTS",
  },
  {
    key: "STAFF",
    label: "Staff",
    href: "/resources/staff",
    icon: UsersRound,
    module: "STAFF",
  },
  {
    key: "CALENDAR",
    label: "Calendario",
    href: "/projects?view=calendar",
    icon: CalendarDays,
    module: "PROJECTS",
  },
  {
    key: "NEW_EXPENSE",
    label: "Ingresar gasto",
    href: "/finance/expenses?create=1",
    icon: ReceiptText,
    module: "FINANCE",
  },
  {
    key: "NEW_EVENT",
    label: "Nuevo Evento",
    href: "/projects?reservation=new",
    icon: CalendarDays,
    module: "PROJECTS",
  },
  {
    key: "SUPPLIER",
    label: "Proveedor",
    href: "/finance/expenses?view=suppliers",
    icon: Handshake,
    module: "FINANCE",
  },
] as const;

export const WIDGETS = [
  {
    key: "TODAY_EVENTS",
    label: "Eventos de hoy",
    href: "/projects?date=today",
    icon: CalendarDays,
    module: "PROJECTS",
  },
  {
    key: "UPCOMING_EVENTS",
    label: "Próximos eventos",
    href: "/projects?focus=upcoming",
    icon: Clock3,
    module: "PROJECTS",
  },
  {
    key: "ACCOUNTS_RECEIVABLE",
    label: "Cuentas por cobrar",
    href: "/finance/receivables",
    icon: CircleDollarSign,
    module: "FINANCE",
  },
  {
    key: "ACCOUNTS_PAYABLE",
    label: "Cuentas por pagar",
    href: "/finance/payables",
    icon: WalletCards,
    module: "FINANCE",
  },
  {
    key: "MONTHLY_REVENUE",
    label: "Ingresos mensuales",
    href: "/reports?period=month&metric=revenue",
    icon: BarChart3,
    module: "REPORTS",
  },
  {
    key: "OPERATIONAL_COST",
    label: "Costo operacional",
    href: "/projects?view=profitability",
    icon: ReceiptText,
    module: "EVENT_PROFITABILITY",
  },
  {
    key: "PROFITABILITY",
    label: "Rentabilidad",
    href: "/projects?view=profitability",
    icon: ChartNoAxesCombined,
    module: "EVENT_PROFITABILITY",
  },
  {
    key: "BUSINESS_INTELLIGENCE",
    label: "Business Intelligence",
    href: "/reports#business-intelligence",
    icon: BarChart3,
    module: "BUSINESS_INTELLIGENCE",
  },
  {
    key: "FUEL",
    label: "Combustible",
    href: "/resources?tab=fleet",
    icon: Fuel,
    module: "FUEL_CONTROL",
  },
  {
    key: "PAPER_CONSUMPTION",
    label: "Consumo de papel",
    href: "/settings#cost-master",
    icon: ScrollText,
    module: "PAPER_CONSUMPTION",
  },
  {
    key: "STAFF",
    label: "Staff",
    href: "/resources/staff",
    icon: UsersRound,
    module: "STAFF",
  },
  {
    key: "FLEET",
    label: "Flota",
    href: "/resources#fleet-title",
    icon: Car,
    module: "FLEET",
  },
  {
    key: "NOTIFICATIONS",
    label: "Notificaciones",
    href: "/notifications",
    icon: CircleDollarSign,
    module: "OPERATIONS",
  },
] as const satisfies readonly {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  module: string;
}[];

export type QuickActionKey = (typeof QUICK_ACTIONS)[number]["key"];
export type WorkspaceWidgetKey = (typeof WIDGETS)[number]["key"];
export const EVENT_MODULES = [
  {
    key: "GENERAL_INFORMATION",
    label: "Información general",
    defaultVisible: true,
  },
  {
    key: "FINANCIAL_SUMMARY",
    label: "Resumen financiero",
    defaultVisible: true,
  },
  { key: "STAFF", label: "Staff", defaultVisible: true },
  { key: "DOCUMENTS", label: "Documentos", defaultVisible: true },
  { key: "CUSTOMER_PORTAL", label: "Portal Cliente", defaultVisible: true },
  { key: "GOOGLE_CALENDAR", label: "Google Calendar", defaultVisible: true },
  { key: "TIMELINE", label: "Timeline", defaultVisible: false },
  { key: "EVENT_HEALTH", label: "Event Health", defaultVisible: false },
  { key: "CHECKLIST", label: "Checklist", defaultVisible: false },
  { key: "MILESTONES", label: "Milestones", defaultVisible: false },
  { key: "GOOGLE_WORKSPACE", label: "Google Workspace", defaultVisible: false },
  { key: "PAYROLL", label: "Payroll", defaultVisible: false },
  {
    key: "OPERATIONAL_CONTROL",
    label: "Control operacional",
    defaultVisible: false,
  },
  { key: "TASK_CENTER", label: "Task Center", defaultVisible: false },
  {
    key: "COMMERCIAL_NEGOTIATION",
    label: "Negociación comercial",
    defaultVisible: false,
  },
] as const;
export type EventModuleKey = (typeof EVENT_MODULES)[number]["key"];
export const MODULE_WORKSPACES = {
  DASHBOARD: [
    { key: "DASHBOARD_HEADER", label: "Encabezado", defaultVisible: true },
    {
      key: "DASHBOARD_WIDGETS",
      label: "KPIs del Founder",
      defaultVisible: true,
    },
    {
      key: "DASHBOARD_STAFF_APPROVALS",
      label: "Aprobaciones de Staff pendientes",
      defaultVisible: true,
    },
    {
      key: "DASHBOARD_QUICK_ACTIONS",
      label: "Acciones rápidas",
      defaultVisible: true,
    },
    {
      key: "DASHBOARD_TODAY",
      label: "Jornada operacional",
      defaultVisible: true,
    },
    {
      key: "DASHBOARD_RECENT_ACTIVITY",
      label: "Actividad reciente",
      defaultVisible: false,
    },
    {
      key: "PUBLICATION_CONSOLE",
      label: "Consola de publicación",
      defaultVisible: false,
    },
    {
      key: "DASHBOARD_WORKSPACE_SETTINGS",
      label: "Configuración del Workspace",
      defaultVisible: true,
    },
  ],
  CUSTOMERS: [
    {
      key: "CUSTOMER_METRICS",
      label: "Indicadores del cliente",
      defaultVisible: true,
    },
    {
      key: "CUSTOMER_INFORMATION",
      label: "Información del cliente",
      defaultVisible: true,
    },
    {
      key: "CUSTOMER_EVENTS",
      label: "Eventos del cliente",
      defaultVisible: true,
    },
    {
      key: "CUSTOMER_DOCUMENTS",
      label: "Documentos y Portal",
      defaultVisible: true,
    },
    {
      key: "CUSTOMER_COMMERCIAL_HISTORY",
      label: "Historial comercial",
      defaultVisible: true,
    },
    {
      key: "CUSTOMER_TIMELINE",
      label: "Timeline del cliente",
      defaultVisible: false,
    },
  ],
  EVENTS: EVENT_MODULES.map((item) => ({ ...item })),
  FINANCE: [
    {
      key: "FINANCE_DASHBOARD",
      label: "KPIs financieros",
      defaultVisible: true,
    },
  ],
  RECEIVABLES: [
    {
      key: "RECEIVABLES_HEADER",
      label: "Encabezado y exportación",
      defaultVisible: true,
    },
    {
      key: "RECEIVABLES_KPIS",
      label: "Indicadores de cobranza",
      defaultVisible: true,
    },
    {
      key: "RECEIVABLES_MANAGEMENT",
      label: "Gestión y movimientos",
      defaultVisible: true,
    },
    {
      key: "RECEIVABLES_INTEGRITY",
      label: "Integridad financiera",
      defaultVisible: false,
    },
  ],
  PAYABLES: [
    {
      key: "PAYABLES_HEADER",
      label: "Encabezado de compromisos",
      defaultVisible: true,
    },
    {
      key: "PAYABLES_KPIS",
      label: "Resumen de pagos",
      defaultVisible: true,
    },
    {
      key: "PAYABLES_PRIORITY",
      label: "Prioridad visual",
      defaultVisible: true,
    },
    {
      key: "PAYABLES_MANAGEMENT",
      label: "Compromisos canónicos",
      defaultVisible: true,
    },
  ],
  STAFF: [
    { key: "STAFF_CENTER", label: "Gestión de Staff", defaultVisible: true },
    { key: "STAFF_PAYMENTS", label: "Pagos de Staff", defaultVisible: true },
    { key: "STAFF_ACCESS", label: "Accesos de Staff", defaultVisible: false },
    {
      key: "STAFF_AVAILABILITY",
      label: "Disponibilidad detallada",
      defaultVisible: false,
    },
  ],
  RESOURCES: [
    {
      key: "RESOURCE_CENTER",
      label: "Centro de Recursos",
      defaultVisible: true,
    },
    { key: "FLEET", label: "Flota", defaultVisible: true },
    { key: "EQUIPMENT", label: "Equipamiento", defaultVisible: true },
    { key: "ROUTE_COSTS", label: "Costos de Ruta", defaultVisible: false },
    {
      key: "INVENTORY",
      label: "Inventario operacional",
      defaultVisible: false,
    },
  ],
  REPORTS: [
    {
      key: "BUSINESS_INTELLIGENCE",
      label: "Business Intelligence",
      defaultVisible: true,
    },
  ],
  SETTINGS: [
    { key: "SYSTEM_HEALTH", label: "System Health", defaultVisible: true },
    {
      key: "COMPANY_SETTINGS",
      label: "Configuración de Empresa",
      defaultVisible: true,
    },
    {
      key: "RESERVATION_DIAGNOSTICS",
      label: "Diagnóstico de Reservas",
      defaultVisible: true,
    },
    {
      key: "FOUNDER_NOTIFICATIONS",
      label: "Notificaciones del Founder",
      defaultVisible: true,
    },
    { key: "CRM_DIAGNOSTICS", label: "Diagnóstico CRM", defaultVisible: true },
    {
      key: "FINANCIAL_INTEGRITY",
      label: "Integridad Financiera",
      defaultVisible: true,
    },
    { key: "MODULE_MANAGER", label: "Module Manager", defaultVisible: true },
    {
      key: "FOUNDER_WORKSPACE",
      label: "Founder Workspace",
      defaultVisible: true,
    },
    {
      key: "PROFITABILITY_SETTINGS",
      label: "Configuración de Rentabilidad",
      defaultVisible: true,
    },
    {
      key: "PRODUCTION_INITIALIZATION",
      label: "Inicialización de Producción",
      defaultVisible: false,
    },
    { key: "MASTER_DATA", label: "Master Data", defaultVisible: true },
    { key: "CONNECTIONS", label: "Conexiones", defaultVisible: true },
    {
      key: "COMMUNICATION_HUB",
      label: "Communication Hub",
      defaultVisible: true,
    },
  ],
} as const;
export type ModuleWorkspaceKey = string;
export type ModuleWorkspacePreference = {
  sectionOrder: string[];
  hiddenSections: string[];
  sectionLabels?: Record<string, string>;
};

export function defaultModuleWorkspaces(): Record<
  string,
  ModuleWorkspacePreference
> {
  return Object.fromEntries(
    Object.entries(MODULE_WORKSPACES).map(([moduleKey, sections]) => [
      moduleKey,
      {
        sectionOrder: sections.map((section) => section.key),
        hiddenSections: sections
          .filter((section) => !section.defaultVisible)
          .map((section) => section.key),
        sectionLabels: Object.fromEntries(
          sections.map((section) => [section.key, section.label]),
        ),
      },
    ]),
  ) as Record<string, ModuleWorkspacePreference>;
}
export type FounderWorkspacePreferences = {
  navigationOrder: NavigationKey[];
  hiddenNavigation: NavigationKey[];
  quickActionOrder: QuickActionKey[];
  hiddenQuickActions: QuickActionKey[];
  favoriteQuickActions: QuickActionKey[];
  widgetOrder: WorkspaceWidgetKey[];
  hiddenWidgets: WorkspaceWidgetKey[];
  hiddenEventModules: EventModuleKey[];
  moduleWorkspaces: Record<string, ModuleWorkspacePreference>;
};
export const DEFAULT_WORKSPACE: FounderWorkspacePreferences = {
  navigationOrder: [
    "HOME",
    "CUSTOMERS",
    "EVENTS",
    "STAFF",
    "RESOURCES",
    "FINANCE",
    "RECEIVABLES",
    "PAYABLES",
    "REPORTS",
    "SETTINGS",
  ],
  hiddenNavigation: [],
  quickActionOrder: QUICK_ACTIONS.map((x) => x.key),
  hiddenQuickActions: [],
  favoriteQuickActions: ["NEW_RESERVATION"],
  widgetOrder: WIDGETS.map((x) => x.key),
  hiddenWidgets: [],
  hiddenEventModules: EVENT_MODULES.filter((x) => !x.defaultVisible).map(
    (x) => x.key,
  ),
  moduleWorkspaces: defaultModuleWorkspaces(),
};

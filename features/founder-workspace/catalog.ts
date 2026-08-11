import type{LucideIcon}from"lucide-react";
import{BarChart3,CalendarDays,Car,ChartNoAxesCombined,CircleDollarSign,Clock3,Contact,FilePlus2,Fuel,Handshake,ReceiptText,ScrollText,UsersRound,WalletCards}from"lucide-react";

export const QUICK_ACTIONS=[
  {key:"NEW_RESERVATION",label:"Nueva Reserva",href:"/projects?reservation=new",icon:FilePlus2,module:"BOOKING_EXPERIENCE"},
  {key:"CUSTOMERS",label:"Clientes",href:"/projects?view=customers",icon:Contact,module:"PROJECTS"},
  {key:"STAFF",label:"Staff",href:"/resources/staff",icon:UsersRound,module:"STAFF"},
  {key:"CALENDAR",label:"Calendario",href:"/projects?view=calendar",icon:CalendarDays,module:"PROJECTS"},
  {key:"NEW_EXPENSE",label:"Nuevo Gasto",href:"/finance/expenses?action=new",icon:ReceiptText,module:"FINANCE"},
  {key:"NEW_EVENT",label:"Nuevo Evento",href:"/projects?reservation=new",icon:CalendarDays,module:"PROJECTS"},
  {key:"SUPPLIER",label:"Proveedor",href:"/finance/expenses?view=suppliers",icon:Handshake,module:"FINANCE"},
]as const;

export const WIDGETS=[
  {key:"TODAY_EVENTS",label:"Eventos de hoy",href:"/projects?date=today",icon:CalendarDays,module:"PROJECTS"},
  {key:"UPCOMING_EVENTS",label:"Próximos eventos",href:"/projects?focus=upcoming",icon:Clock3,module:"PROJECTS"},
  {key:"ACCOUNTS_RECEIVABLE",label:"Cuentas por cobrar",href:"/finance/receivables",icon:CircleDollarSign,module:"FINANCE"},
  {key:"ACCOUNTS_PAYABLE",label:"Cuentas por pagar",href:"/finance/expenses?status=pending",icon:WalletCards,module:"FINANCE"},
  {key:"MONTHLY_REVENUE",label:"Ingresos mensuales",href:"/reports?period=month&metric=revenue",icon:BarChart3,module:"REPORTS"},
  {key:"OPERATIONAL_COST",label:"Costo operacional",href:"/projects?view=profitability",icon:ReceiptText,module:"EVENT_PROFITABILITY"},
  {key:"PROFITABILITY",label:"Rentabilidad",href:"/projects?view=profitability",icon:ChartNoAxesCombined,module:"EVENT_PROFITABILITY"},
  {key:"BUSINESS_INTELLIGENCE",label:"Business Intelligence",href:"/reports#business-intelligence",icon:BarChart3,module:"BUSINESS_INTELLIGENCE"},
  {key:"FUEL",label:"Combustible",href:"/resources?tab=fleet",icon:Fuel,module:"FUEL_CONTROL"},
  {key:"PAPER_CONSUMPTION",label:"Consumo de papel",href:"/settings#cost-master",icon:ScrollText,module:"PAPER_CONSUMPTION"},
  {key:"STAFF",label:"Staff",href:"/resources/staff",icon:UsersRound,module:"STAFF"},
  {key:"FLEET",label:"Flota",href:"/resources#fleet-title",icon:Car,module:"FLEET"},
  {key:"NOTIFICATIONS",label:"Notificaciones",href:"/notifications",icon:CircleDollarSign,module:"OPERATIONS"},
]as const satisfies readonly{key:string;label:string;href:string;icon:LucideIcon;module:string}[];

export type QuickActionKey=(typeof QUICK_ACTIONS)[number]["key"];
export type WorkspaceWidgetKey=(typeof WIDGETS)[number]["key"];
export type FounderWorkspacePreferences={quickActionOrder:QuickActionKey[];hiddenQuickActions:QuickActionKey[];favoriteQuickActions:QuickActionKey[];widgetOrder:WorkspaceWidgetKey[];hiddenWidgets:WorkspaceWidgetKey[]};
export const DEFAULT_WORKSPACE:FounderWorkspacePreferences={quickActionOrder:QUICK_ACTIONS.map(x=>x.key),hiddenQuickActions:[],favoriteQuickActions:["NEW_RESERVATION"],widgetOrder:WIDGETS.map(x=>x.key),hiddenWidgets:[]};

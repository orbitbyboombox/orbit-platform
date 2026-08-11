import { BarChart3, Bot, Boxes, BriefcaseBusiness, CalendarCheck2, Car, ChartNoAxesCombined, CircleDollarSign, ClipboardCheck, Contact, Factory, FileChartColumn, FolderKanban, Fuel, Gauge, Image, PackageCheck, PanelsTopLeft, ReceiptText, Route, ScrollText, Sparkles, Users, Warehouse } from "lucide-react";

export const moduleCategories=["FOUNDATION","OPERATIONS","BUSINESS","CUSTOMER_EXPERIENCE","AI","LAB"] as const;
export type ModuleCategory=(typeof moduleCategories)[number];
export type OrbitModuleKey=(typeof ORBIT_MODULE_CATALOG)[number]["key"];

export const ORBIT_MODULE_CATALOG=[
  {key:"DASHBOARD",name:"Dashboard",description:"Centro de control diario y accesos operacionales.",category:"FOUNDATION",icon:Gauge},
  {key:"COMMERCIAL",name:"Commercial",description:"Cotizaciones, acuerdos y negociación comercial.",category:"FOUNDATION",icon:BriefcaseBusiness},
  {key:"PROJECTS",name:"Projects",description:"Clientes, reservas y Event 360°.",category:"FOUNDATION",icon:FolderKanban},
  {key:"OPERATIONS",name:"Operations",description:"Preparación y ejecución de eventos.",category:"FOUNDATION",icon:CalendarCheck2},
  {key:"RESOURCES",name:"Resources",description:"Recursos operacionales configurables.",category:"FOUNDATION",icon:Boxes},
  {key:"FINANCE",name:"Finance",description:"Control financiero, gastos y cobranzas.",category:"FOUNDATION",icon:CircleDollarSign},
  {key:"REPORTS",name:"Reports",description:"Reportes operacionales y ejecutivos.",category:"FOUNDATION",icon:FileChartColumn},
  {key:"CUSTOMER_PORTAL",name:"Customer Portal",description:"Experiencia privada de clientes.",category:"FOUNDATION",icon:Contact},
  {key:"STAFF",name:"Staff",description:"Equipo, capacidades, asignaciones y pagos.",category:"OPERATIONS",icon:Users},
  {key:"FLEET",name:"Fleet",description:"Vehículos y disponibilidad operacional.",category:"OPERATIONS",icon:Car},
  {key:"EQUIPMENT",name:"Equipment",description:"Equipamiento, estados e historial.",category:"OPERATIONS",icon:PackageCheck},
  {key:"ROUTE_COSTS",name:"Route Costs",description:"Rutas y distribución automática de combustible.",category:"OPERATIONS",icon:Route},
  {key:"COST_MASTER",name:"Cost Master",description:"Fuente editable de costos operacionales.",category:"OPERATIONS",icon:ReceiptText},
  {key:"BUSINESS_INTELLIGENCE",name:"Business Intelligence",description:"Indicadores ejecutivos y tendencias.",category:"BUSINESS",icon:BarChart3},
  {key:"EVENT_PROFITABILITY",name:"Event Profitability",description:"Costo y margen real por evento.",category:"BUSINESS",icon:ChartNoAxesCombined},
  {key:"INVENTORY",name:"Inventory",description:"Disponibilidad e inventario operacional.",category:"BUSINESS",icon:Warehouse},
  {key:"FUEL_CONTROL",name:"Fuel Control",description:"Cargas, comprobantes y costos de combustible.",category:"BUSINESS",icon:Fuel},
  {key:"PAPER_CONSUMPTION",name:"Paper Consumption",description:"Consumo y costo de papel fotográfico.",category:"BUSINESS",icon:ScrollText},
  {key:"STRIP_CONTROL",name:"Strip Control",description:"Control de tiras y consumibles de producción.",category:"BUSINESS",icon:Factory},
  {key:"EVENT_CHECKLIST",name:"Event Checklist",description:"Checklist antes, durante y después del evento.",category:"BUSINESS",icon:ClipboardCheck},
  {key:"BOOKING_EXPERIENCE",name:"Booking Experience",description:"Reserva manual y automática guiada.",category:"CUSTOMER_EXPERIENCE",icon:PanelsTopLeft},
  {key:"CUSTOMER_TIMELINE",name:"Customer Timeline",description:"Historial visible de la experiencia del cliente.",category:"CUSTOMER_EXPERIENCE",icon:ScrollText},
  {key:"NOVA_CORE",name:"NOVA CORE",description:"Asistencia operacional y recomendaciones NOVA.",category:"AI",icon:Sparkles},
  {key:"WHATSAPP_AI",name:"WhatsApp IA",description:"Automatización inteligente para WhatsApp.",category:"AI",icon:Bot},
  {key:"INSTAGRAM_AI",name:"Instagram IA",description:"Automatización inteligente para Instagram.",category:"AI",icon:Image},
  {key:"EXPERIMENTAL_FEATURES",name:"Experimental Features",description:"Funciones en evaluación controlada.",category:"LAB",icon:Bot},
] as const satisfies readonly {key:string;name:string;description:string;category:ModuleCategory;icon:typeof Gauge}[];

export const categoryLabels:Record<ModuleCategory,string>={FOUNDATION:"Foundation",OPERATIONS:"Operations",BUSINESS:"Business",CUSTOMER_EXPERIENCE:"Customer Experience",AI:"AI",LAB:"Lab"};
const V1_MODULE_KEYS=new Set<string>(["DASHBOARD","COMMERCIAL","PROJECTS","OPERATIONS","RESOURCES","FINANCE","REPORTS","CUSTOMER_PORTAL","STAFF","FLEET","EQUIPMENT","ROUTE_COSTS","COST_MASTER","BUSINESS_INTELLIGENCE","EVENT_PROFITABILITY","INVENTORY","FUEL_CONTROL","PAPER_CONSUMPTION","STRIP_CONTROL","EVENT_CHECKLIST","BOOKING_EXPERIENCE","CUSTOMER_TIMELINE","NOVA_CORE","WHATSAPP_AI","INSTAGRAM_AI","EXPERIMENTAL_FEATURES"]);
export const defaultModuleStates=Object.fromEntries(ORBIT_MODULE_CATALOG.map(item=>[item.key,V1_MODULE_KEYS.has(item.key)])) as Record<OrbitModuleKey,boolean>;

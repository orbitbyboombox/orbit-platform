"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronRight,
  Download,
  AlertTriangle,
  MapPin,
  Navigation,
  Phone,
  Truck,
  Upload,
  X,
} from "lucide-react";
import {
  acceptStaffAssignmentAction,
  cancelStaffAssignmentAction,
  changeStaffPasswordAction,
  completeStaffChecklistItemAction,
  declineStaffResponsibilityAction,
  recordStaffCheckInAction,
  rejectAssignedStaffAssignmentAction,
  requestStaffResponsibilitiesAction,
  updateStaffLogisticsTripAction,
  submitStaffExpenseAction,
  reportStaffOperatorIncidentAction,
} from "./staff-portal.actions";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { StaffMonthlyAccountPanel } from "@/features/staff-monthly-account/staff-monthly-account-panel";
import type { StaffMonthlyAccount } from "@/features/staff-monthly-account/model";
import { StaffConsumablesPanel } from "./staff-consumables-panel";
import { StaffBoxOperationsPanel } from "./staff-box-operations-panel";

export type StaffPortalEvent = {
  id: string;
  orbitEventId: string;
  customer: string;
  clientPhone: string;
  productionContact: string;
  productionPhone: string;
  eventType: string;
  service: string;
  duration: number;
  extras: string[];
  date: string;
  staffCallAt: string | null;
  start: string;
  timeMode?: "ESTIMATED" | "CONFIRMED";
  finish: string;
  address: string;
  district: string;
  venue: string;
  roles: string[];
  net: number;
  status: string;
  vehicle: string;
  logistics: Array<{id:string;type:string;sequence:number;vehicle:string;driver:string;departure:string;arrival:string;meetingPoint:string;route:string;instructions:string;status:string}>;
  equipment: string[];
  operationalInformation: {
    observations: string;
    specialInstructions: string;
    equipmentNotes: string;
    setupNotes: string;
    emergencyNotes: string;
  };
  documents: Array<{ id: string; type: string }>;
  checkins: string[];
  checklist: string[];
};
export type StaffPortalPayment = {
  generated: number;
  paid: number;
  pending: number;
  receiptStatus: string;
};
export type AvailableStaffEvent = {
  id: string;
  orbitEventId: string;
  eventType: string;
  customer: string;
  clientPhone: string;
  productionContact: string;
  productionPhone: string;
  service: string;
  duration: number;
  date: string;
  start: string;
  timeMode?: "ESTIMATED" | "CONFIRMED";
  finish: string;
  address: string;
  district: string;
  venue: string;
  vehicle: string;
  equipment: string[];
  available: string[];
  payments: {
    operator: number;
    assembly: number;
    disassembly: number;
    combined: number;
    transportationBonus: number;
  };
};
export type StaffRequest = {
  id: string;
  projectId: string;
  customer: string;
  responsibility: string;
  status: string;
  requestedAt: string;
};
export type StaffRoute = {
  id: string;
  date: string;
  direction: "MONTAJE" | "DESMONTAJE";
  vehicle: string;
  driver: string;
  notes: string;
  capacity: number;
  stops: Array<{
    id: string;
    sequence: number;
    event: string;
    date: string;
    time: string;
    venue: string;
    district: string;
    address: string;
    service: string;
    equipment: string;
    observations: string;
    role: string;
    status: string;
  }>;
};
export type StaffExpenseSubmission = { id:string;projectId:string;category:string;amount:number;occurredOn:string;description:string;status:string;rejectionReason:string;reimbursement:boolean;reimbursementPaymentStatus:"NOT_APPLICABLE"|"PENDING"|"PAID";reimbursementPaidOn:string };
const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
const ROLE: Record<string, string> = {
  OPERATOR: "Operador",
  ASSEMBLY: "Montaje",
  DISASSEMBLY: "Desmontaje",
  ASSEMBLY_DISASSEMBLY: "Montaje + Desmontaje",
};
const executionActions = (roles: string[]) => [
  { code: "ON_THE_WAY", label: "En camino" },
  { code: "ARRIVED", label: "Llegué" },
  ...(roles.includes("ASSEMBLY")
    ? [
        { code: "ASSEMBLY_STARTED", label: "Iniciar montaje" },
        { code: "ASSEMBLY_COMPLETED", label: "Montaje listo" },
      ]
    : []),
  ...(roles.includes("OPERATOR")
    ? [
        { code: "EVENT_STARTED", label: "Iniciar servicio" },
        { code: "EVENT_FINISHED", label: "Finalizar servicio" },
      ]
    : []),
  ...(roles.includes("DISASSEMBLY")
    ? [
        { code: "DISASSEMBLY_STARTED", label: "Iniciar desmontaje" },
        { code: "DISASSEMBLY_COMPLETED", label: "Desmontaje completo" },
      ]
    : []),
];
const participationCompleted = (event: StaffPortalEvent) =>
  event.roles.every((role) =>
    event.checkins.includes(
      role === "ASSEMBLY"
        ? "ASSEMBLY_COMPLETED"
        : role === "DISASSEMBLY"
          ? "DISASSEMBLY_COMPLETED"
          : "EVENT_FINISHED",
    ),
  );
const PRE_EVENT = [
  { code: "READ_OPERATIONAL_SHEET", label: "Leer ficha operacional" },
  { code: "EQUIPMENT_CHECKED", label: "Equipos revisados" },
  { code: "VEHICLE_CHECKED", label: "Vehículo revisado" },
  { code: "ROUTE_REVIEWED", label: "Ruta revisada" },
  { code: "READY_TO_DEPART", label: "Listo para salir" },
];
const OPERATOR_PAPER_CHECKS = [
  { code: "PAPER_LOADED", label: "Papel cargado correctamente" },
  { code: "PAPER_FORMAT_MATCH", label: "Formato coincide con el indicado" },
  { code: "PRINTER_RECOGNIZES_PAPER", label: "Impresora reconoce el papel" },
  { code: "PAPER_NO_DAMAGE", label: "Papel sin daño visible" },
];
const OPERATOR_EQUIPMENT_CHECKS = [
  { code: "EQUIPMENT_POWER", label: "Equipo enciende correctamente" },
  { code: "CAMERA_OPERATIONAL", label: "Cámara operativa" },
  { code: "PRINTER_OPERATIONAL", label: "Impresora operativa" },
  { code: "SCREEN_OPERATIONAL", label: "Pantalla operativa" },
  { code: "FLASH_OPERATIONAL", label: "Flash / iluminación operativa" },
  { code: "CABLES_PRESENT", label: "Cables / accesorios presentes" },
];
const pendingAcceptance = (status: string) =>
  ["PENDING", "PENDING_CONFIRMATION", "ASSIGNED"].includes(status);
export const staffGreeting = (hour: number) =>
  hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
type StaffModule = "OPERADORES" | "MONTAJE" | "FINANZAS";
// Asignación semanal · Eventos publicados remain inside OPERADORES.
const chileToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(
    new Date(),
  );
const currentWeekRange = () => {
  const [year, month, day] = chileToday().split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (current.getUTCDay() + 6) % 7;
  const start = new Date(current);
  start.setUTCDate(current.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const format = (value: Date) =>
    new Intl.DateTimeFormat("es-CL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(value);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: `${format(start)} – ${format(end)}`,
  };
};
const stateLabel = (event: StaffPortalEvent) =>
  pendingAcceptance(event.status)
    ? "Pendiente de aceptación"
    : participationCompleted(event)
      ? "Completado"
      : event.checkins.includes("EVENT_STARTED")
        ? "Evento iniciado"
        : event.checkins.includes("ARRIVED")
          ? "Llegó"
          : event.checkins.includes("ON_THE_WAY")
            ? "En camino"
            : "Aceptado";

export function StaffPortalDashboard({
  name,
  events,
  payment,
  notifications,
  availableEvents,
  routes,
  requests,
  expenseSubmissions,
  monthlyAccounts,
  mustChangePassword,
  initialEventId,
}: {
  name: string;
  events: StaffPortalEvent[];
  payment: StaffPortalPayment;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    date: string;
  }>;
  availableEvents: AvailableStaffEvent[];
  routes: StaffRoute[];
  requests: StaffRequest[];
  expenseSubmissions: StaffExpenseSubmission[];
  monthlyAccounts: StaffMonthlyAccount[];
  mustChangePassword: boolean;
  initialEventId?: string;
}) {
  const [selected, setSelected] = useState<StaffPortalEvent | null>(null);
  const [module, setModule] = useState<StaffModule | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    if (initialEventId) {
      setSelected(events.find((event) => event.id === initialEventId) ?? null);
    }
  }, [events, initialEventId]);
  useEffect(() => {
    const value = new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Santiago",
    }).formatToParts(new Date()).find((part) => part.type === "hour")?.value;
    setHour(Number(value ?? 12));
  }, []);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
  const todayEvents = events.filter((event) => event.date === today),
    week = currentWeekRange(),
    weekEvents = events.filter(
      (event) => event.date >= week.start && event.date <= week.end,
    ),
    weeklyAvailableEvents = availableEvents.filter(
      (event) => event.date >= week.start && event.date <= week.end,
    ),
    confirmed = events.filter(
      (event) =>
        !pendingAcceptance(event.status) &&
        !participationCompleted(event),
    );
  if (mustChangePassword) return <PasswordSetup name={name} />;
  return (
    <div className="space-y-6 overflow-x-hidden">
      <header className="rounded-3xl border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          Portal Staff
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {staffGreeting(hour ?? 12)}, {name}.
        </h1>
        <p className="mt-2 text-muted">Tu operación, montaje y finanzas en un solo lugar.</p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-brand/30 bg-brand/10 px-4 text-sm font-semibold text-brand"
          href="/staff-portal/academy"
        >
          🎓 BOOMBOX Academy
        </Link>
      </header>
      {module === null ? <StaffHome module={setModule} weekEvents={weekEvents.length} todayEvents={todayEvents.length} /> : null}
      {module !== null ? <StaffModuleNav active={module} onChange={setModule} /> : null}
      {module === "OPERADORES" ? <OperatorsModule events={events} weeklyAvailableEvents={weeklyAvailableEvents} requests={requests} week={week} confirmed={confirmed.length} onSelect={setSelected} /> : null}
      {module === "MONTAJE" ? <MontageModule routes={routes} /> : null}
      {module === "FINANZAS" ? <FinanceModule events={events} expenseSubmissions={expenseSubmissions} monthlyAccounts={monthlyAccounts} payment={payment} notifications={notifications} /> : null}
      {selected ? (
        <EventDetail event={selected} close={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function StaffHome({module, weekEvents, todayEvents}:{module:(value:StaffModule)=>void;weekEvents:number;todayEvents:number}) {
  const cards:[StaffModule,string,string,string][] = [
    ["OPERADORES", "Operadores", `${weekEvents} eventos esta semana`, "Eventos, asignaciones y operación"],
    ["MONTAJE", "Montaje", "Rutas y jornadas", "Montaje, desmontaje y vehículos"],
    ["FINANZAS", "Finanzas", "Pagos y gastos", "Liquidaciones, anticipos y documentos"],
  ];
  return <section className="space-y-4" data-staff-home-modules="3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Tu jornada BOOMBOX</p><h2 className="mt-1 text-2xl font-semibold">¿Qué necesitas revisar?</h2><p className="mt-1 text-sm text-muted">{todayEvents} evento{todayEvents===1?"":"s"} para hoy.</p></div><div className="grid gap-4 sm:grid-cols-3">{cards.map(([key,title,summary,description])=><button key={key} data-staff-module={key} onClick={()=>module(key)} className="group min-h-44 rounded-3xl border bg-card p-5 text-left transition hover:border-brand/60 hover:bg-brand/5"><span className="text-xs font-semibold uppercase tracking-[.16em] text-brand">{key}</span><h3 className="mt-8 text-xl font-semibold">{title}</h3><p className="mt-1 text-sm text-muted">{summary}</p><p className="mt-4 text-sm text-muted transition group-hover:text-foreground">{description} <ChevronRight className="ml-1 inline size-4 text-brand" /></p></button>)}</div><button onClick={()=>module("FINANZAS")} className="inline-flex min-h-11 items-center rounded-xl border border-brand/40 bg-brand/10 px-4 text-sm font-semibold text-brand">SUBE TU GASTO <ChevronRight className="ml-2 size-4" /></button><Link className="ml-3 text-sm text-muted underline-offset-4 hover:underline" href="/staff-portal/academy">BOOMBOX Academy</Link></section>;
}

function StaffModuleNav({active,onChange}:{active:StaffModule;onChange:(value:StaffModule|null)=>void}) { return <nav className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2" aria-label="Módulos del Portal Staff">{(["OPERADORES","MONTAJE","FINANZAS"] as StaffModule[]).map(item=><button key={item} onClick={()=>onChange(item)} aria-current={active===item?"page":undefined} className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${active===item?"bg-brand text-brand-foreground":"text-muted hover:text-foreground"}`}>{item}</button>)}<button className="ml-auto min-h-10 px-3 text-sm text-muted" onClick={()=>onChange(null)}>Inicio</button></nav>; }

function OperatorsModule({events,weeklyAvailableEvents,requests,week,confirmed,onSelect}:{events:StaffPortalEvent[];weeklyAvailableEvents:AvailableStaffEvent[];requests:StaffRequest[];week:{label:string};confirmed:number;onSelect:(event:StaffPortalEvent)=>void}) { return <section className="space-y-6" data-staff-module-view="OPERADORES"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">OPERADORES</p><h2 className="mt-1 text-2xl font-semibold">Eventos y operación</h2><p className="mt-1 text-sm text-muted">{week.label} · disponibles: {weeklyAvailableEvents.length} · confirmados: {confirmed}</p></div><AvailableEvents events={weeklyAvailableEvents} requests={requests} /><section className="rounded-3xl border border-white/10 bg-[#111214] p-5 text-white shadow-[0_20px_70px_rgba(0,0,0,.22)] sm:p-7"><h2 className="text-xl font-semibold">Mis eventos asignados</h2><p className="mt-1 text-sm text-white/60">Las asignaciones nuevas aparecen primero y requieren tu aceptación.</p><div className="mt-5 space-y-2">{events.map(event=><button className="group grid w-full gap-4 rounded-2xl border border-white/10 bg-[#191a1d] p-4 text-left transition hover:border-brand/70 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center" key={event.id} onClick={()=>onSelect(event)}><div className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#0d0e10] text-center ring-1 ring-white/10"><span className="text-[10px] uppercase tracking-[.16em] text-brand">{new Date(`${event.date}T12:00:00Z`).toLocaleDateString("es-CL",{weekday:"short"})}</span><strong className="text-2xl leading-none">{event.date.slice(8,10)}</strong><span className="text-[10px] text-white/50">{event.date.slice(5,7)}</span></div><div className="min-w-0"><p className="font-semibold">{event.customer}</p><p className="mt-1 text-sm font-semibold text-white/80">{event.service} · {event.duration}h · {event.start}–{event.finish}</p><p className="mt-1 text-sm text-white/60">{event.venue||event.address} · {event.district}</p><p className="mt-2 text-xs text-white/45">Citación {event.staffCallAt?.slice(11,16)||"por confirmar"} · {event.extras.length?event.extras.join(" + "):"Sin extras"}</p></div><div className="flex items-center gap-3 sm:justify-end"><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">{stateLabel(event)}</span><ChevronRight className="size-5 text-white/40 transition group-hover:text-brand" /></div></button>)}{events.length===0?<p className="py-8 text-sm text-muted">No tienes eventos asignados durante los próximos 15 días.</p>:null}</div></section></section>; }

function MontageModule({routes}:{routes:StaffRoute[]}) { return <section className="space-y-4" data-staff-module-view="MONTAJE"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">MONTAJE</p><h2 className="mt-1 text-2xl font-semibold">Rutas y jornadas operativas</h2><p className="mt-1 text-sm text-muted">Consulta el orden oficial de montaje y desmontaje asignado.</p></div><div className="flex gap-2" role="tablist"><span className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">MONTAJE</span><span className="rounded-xl border px-4 py-2 text-sm font-semibold text-muted">DESMONTAJE</span></div><StaffRoutesPanel routes={routes} /></section>; }

function FinanceModule({events,expenseSubmissions,monthlyAccounts,payment,notifications}:{events:StaffPortalEvent[];expenseSubmissions:StaffExpenseSubmission[];monthlyAccounts:StaffMonthlyAccount[];payment:StaffPortalPayment;notifications:Array<{id:string;title:string;message:string;date:string}>}) { return <section className="space-y-6" data-staff-module-view="FINANZAS"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">FINANZAS</p><h2 className="mt-1 text-2xl font-semibold">Tus pagos y gastos</h2></div><StaffExpenseSubmissionPanel events={events} submissions={expenseSubmissions} /><section className="space-y-3"><h3 className="text-xl font-semibold">Liquidaciones mensuales</h3>{monthlyAccounts.map(account=><StaffMonthlyAccountPanel account={account} key={account.id} mode="STAFF"/>)}{!monthlyAccounts.length&&<p className="rounded-2xl border p-4 text-sm text-muted">Aún no hay liquidaciones mensuales disponibles.</p>}</section><section className="grid gap-6 lg:grid-cols-2"><div className="rounded-3xl border bg-card p-5 sm:p-7"><h3 className="text-xl font-semibold">Resumen</h3><div className="mt-5 grid grid-cols-2 gap-3"><Small label="Generado" value={money(payment.generated)}/><Small label="Ya pagado" value={money(payment.paid)}/><Small label="Pago pendiente" value={money(payment.pending)}/><Small label="Boleta SII" value={payment.receiptStatus}/></div></div><div className="rounded-3xl border bg-card p-5 sm:p-7"><h3 className="text-xl font-semibold">Notificaciones</h3><div className="mt-4 space-y-3">{notifications.map(item=><div className="rounded-xl border p-3" key={item.id}><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-sm text-muted">{item.message}</p><p className="mt-2 text-xs text-muted">{item.date}</p></div>)}{!notifications.length?<p className="text-sm text-muted">Sin notificaciones financieras.</p>:null}</div></div></section></section>; }
function StaffExpenseSubmissionPanel({events,submissions}:{events:StaffPortalEvent[];submissions:StaffExpenseSubmission[]}) {
  const [open,setOpen]=useState(false),[pending,start]=useTransition(),[message,setMessage]=useState("");
  const submit=(form:FormData)=>start(async()=>{const result=await submitStaffExpenseAction(form);setMessage(result.message);if(result.ok){setOpen(false);location.reload();}});
  return <section className="rounded-3xl border border-brand/30 bg-brand/5 p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Reembolsos y gastos autorizados</p><h2 className="mt-1 text-xl font-semibold">Sube tu gasto</h2><p className="mt-1 text-sm text-muted">Adjunta el comprobante. No impactará finanzas hasta que el Founder lo apruebe.</p></div><button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground" onClick={()=>setOpen(true)}><Upload className="size-4"/>Sube tu gasto</button></div>{message?<p className="mt-4 rounded-xl border bg-card p-3 text-sm">{message}</p>:null}<div className="mt-4 grid gap-2 sm:grid-cols-2">{submissions.map(item=><div className="rounded-xl border bg-card p-3 text-sm" key={item.id}><div className="flex justify-between gap-3"><strong>{item.category}</strong><strong>{money(item.amount)}</strong></div><p className="mt-1 text-muted">{item.occurredOn} · {item.status==="PENDING_REVIEW"?"PENDIENTE":item.status==="APPROVED"?"APROBADO":item.status==="REJECTED"?"RECHAZADO":item.status}</p>{item.status==="APPROVED"&&item.reimbursement?<p className={`mt-1 font-semibold ${item.reimbursementPaymentStatus==="PAID"?"text-emerald-600":"text-amber-600"}`}>{item.reimbursementPaymentStatus==="PAID"?`REEMBOLSO PAGADO${item.reimbursementPaidOn?` · ${item.reimbursementPaidOn}`:""}`:"REEMBOLSO PENDIENTE DE PAGO"}</p>:null}{item.rejectionReason?<p className="mt-1 text-red-600">Motivo: {item.rejectionReason}</p>:null}</div>)}</div>{open?<MobileDialog description="Selecciona uno de tus Eventos asignados y adjunta el comprobante." eyebrow="Portal Staff" onClose={()=>setOpen(false)} size="lg" title="Sube tu gasto" variant="fullscreen-mobile"><form action={submit} className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Evento asignado<select className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" defaultValue={events.length===1?events[0]?.id:""} name="projectId" required><option value="">Seleccionar Evento</option>{events.map(event=><option key={event.id} value={event.id}>{event.date} · {event.customer} · {event.service}</option>)}</select></label><label className="text-sm font-medium">Categoría<select className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="category" required><option value="UBER_TRANSPORT">Uber / transporte</option><option value="FOOD">Comida</option><option value="PARKING">Estacionamiento</option><option value="TOLLS">Peaje</option><option value="MOBILITY">Movilización</option><option value="OTHER">Otro</option></select></label><label className="text-sm font-medium">Monto<input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" min="1" name="amount" required type="number"/></label><label className="text-sm font-medium">Fecha<input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="occurredOn" required type="date"/></label><label className="text-sm font-medium">Método<select className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="paymentMethod"><option value="PERSONAL_CARD">Tarjeta personal</option><option value="CASH">Efectivo</option><option value="COMPANY_CARD">Tarjeta empresa</option><option value="OTHER">Otro</option></select></label><label className="text-sm font-medium sm:col-span-2">Responsable del pago<select className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="expenseOwner"><option value="REIMBURSEMENT">Lo pagué yo, requiere reembolso</option><option value="COMPANY_PAID">Lo pagó BOOMBOX directamente</option></select></label><label className="text-sm font-medium sm:col-span-2">Descripción<input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="description" placeholder="Obligatoria para Otro"/></label><label className="text-sm font-medium sm:col-span-2">Observación<textarea className="mt-2 min-h-20 w-full rounded-xl border bg-background p-3" name="notes"/></label><label className="text-sm font-medium sm:col-span-2">Comprobante<input accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="mt-2 block w-full rounded-xl border bg-background p-2" name="receipt" required type="file"/></label><button className="min-h-12 rounded-xl bg-brand px-5 font-semibold text-brand-foreground sm:col-span-2" aria-busy={pending} disabled={pending}>{pending?"Enviando…":"Enviar a revisión"}</button></form></MobileDialog>:null}</section>;
}

function PasswordSetup({ name }: { name: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <section className="mx-auto max-w-xl rounded-3xl border bg-card p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
        Primer ingreso
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Hola, {name}</h1>
      <p className="mt-2 text-sm text-muted">
        Crea tu contraseña personal para continuar. El PIN temporal dejará de
        funcionar.
      </p>
      <form
        className="mt-6 space-y-3"
        action={(data) =>
          start(async () => {
            const result = await changeStaffPasswordAction(data);
            setMessage(result.message);
            if (result.ok) location.reload();
          })
        }
      >
        <input
          autoComplete="new-password"
          className="min-h-11 w-full rounded-xl border bg-background px-3"
          minLength={8}
          name="password"
          placeholder="Nueva contraseña (mínimo 8 caracteres)"
          required
          type="password"
        />
        <input
          autoComplete="new-password"
          className="min-h-11 w-full rounded-xl border bg-background px-3"
          minLength={8}
          name="confirmation"
          placeholder="Repetir contraseña"
          required
          type="password"
        />
        <button
          className="min-h-11 w-full rounded-xl bg-brand px-4 font-semibold text-brand-foreground disabled:opacity-50"
          aria-busy={pending} disabled={pending}
        >
          {pending ? "Guardando…" : "Crear contraseña y continuar"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </section>
  );
}
const isoDateShift = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const weekStartFor = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};
function StaffRoutesPanel({ routes }: { routes: StaffRoute[] }) {
  const [offset, setOffset] = useState(0);
  const anchor = weekStartFor(chileToday());
  const start = isoDateShift(anchor, offset * 7);
  const end = isoDateShift(start, 6);
  const visible = routes.filter((route) => route.date >= start && route.date <= end);
  const label = new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const range = `${label.format(new Date(`${start}T12:00:00Z`))} – ${label.format(new Date(`${end}T12:00:00Z`))}`;
  return (
    <section className="rounded-3xl border border-brand/30 bg-[#111214] p-5 text-white shadow-[0_20px_70px_rgba(0,0,0,.22)] sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Rutas y logística</p>
          <h2 className="mt-1 text-xl font-semibold">Mi semana operativa</h2>
          <p className="mt-1 text-sm text-white/60">Solo aparecen rutas oficiales donde tienes una asignación compatible.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button aria-label="Semana anterior" className="min-h-10 rounded-xl border border-white/10 px-3 text-white/70 hover:border-brand/50" onClick={() => setOffset((value) => value - 1)}>‹</button>
          <span className="min-w-44 text-center font-semibold">{offset === 0 ? "SEMANA ACTUAL · " : ""}{range}</span>
          <button aria-label="Semana siguiente" className="min-h-10 rounded-xl border border-white/10 px-3 text-white/70 hover:border-brand/50" onClick={() => setOffset((value) => value + 1)}>›</button>
        </div>
      </div>
      <div className="mt-5 space-y-5">
        {(["MONTAJE", "DESMONTAJE"] as const).map((direction) => {
          const group = visible.filter((route) => route.direction === direction);
          return (
            <section className="rounded-2xl border border-white/10 bg-[#191a1d] p-4" key={direction}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-brand">{direction} · RUTA OFICIAL</h3>
                <span className="text-xs text-white/55">{group.reduce((sum, route) => sum + route.stops.length, 0)} paradas</span>
              </div>
              <div className="mt-3 space-y-3">
                {group.map((route) => (
                  <article className="rounded-xl border border-white/10 bg-[#111214] p-3" key={`${route.id}-${direction}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <p className="font-semibold"><Truck className="mr-1 inline size-4 text-brand" />{route.vehicle} · {route.driver}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${route.capacity > 5 ? "bg-red-500/15 text-red-300" : "bg-brand/10 text-brand"}`}>Carga {route.capacity}/5</span>
                    </div>
                    {route.capacity > 5 ? <p className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs font-semibold text-red-300">ALERTA: esta ruta supera el máximo operativo de 5 tótems.</p> : null}
                    {route.notes ? <p className="mt-2 text-xs text-white/55">Nota de ruta: {route.notes}</p> : null}
                    <div className="mt-3 space-y-2">
                      {route.stops.map((stop) => (
                        <details className="rounded-lg border border-white/10 p-3" key={stop.id}>
                          <summary className="cursor-pointer list-none">
                            <div className="grid gap-2 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center">
                              <strong className="text-brand">{stop.sequence}.</strong>
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{stop.event}</p>
                                <p className="text-xs text-white/55">{stop.date} · {stop.time} · {stop.district} · {stop.service}</p>
                              </div>
                              <span className="text-xs font-semibold text-white/65">{stop.equipment}</span>
                            </div>
                          </summary>
                          <dl className="mt-3 grid gap-2 border-t border-white/10 pt-3 text-sm sm:grid-cols-2">
                            <RouteDetail label="Lugar / dirección" value={`${stop.venue} · ${stop.address}`} />
                            <RouteDetail label="Rol" value={stop.role} />
                            <RouteDetail label="Estado" value={stop.status} />
                            <RouteDetail label="Observaciones" value={stop.observations} />
                          </dl>
                        </details>
                      ))}
                    </div>
                  </article>
                ))}
                {!group.length ? <p className="py-4 text-sm text-white/50">No hay paradas asignadas en esta semana.</p> : null}
              </div>
            </section>
          );
        })}
        {!visible.length ? <p className="rounded-xl border border-dashed border-white/15 p-5 text-center text-sm text-white/55">No tienes rutas publicadas para este rango.</p> : null}
      </div>
    </section>
  );
}
function RouteDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-white/45">{label}</dt><dd className="mt-1 text-white/80">{value || "Sin información"}</dd></div>;
}
function AvailableEvents({
  events,
  requests,
}: {
  events: AvailableStaffEvent[];
  requests: StaffRequest[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<AvailableStaffEvent | null>(null);
  const request = (projectId: string, roles: string | string[]) =>
    start(async () => {
      const result = await requestStaffResponsibilitiesAction(projectId, Array.isArray(roles) ? roles : [roles]);
      setMessage(result.message);
      if (result.ok) location.reload();
    });
  return (
    <section className="rounded-3xl border bg-card p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Eventos disponibles</h2>
      <p className="mt-1 text-sm text-muted">
        Solo aparecen eventos publicados por el Founder. Las responsabilidades
        se habilitan cuando Operaciones publica una necesidad compatible.
      </p>
      {message ? (
        <p className="mt-4 rounded-xl border border-brand/20 bg-brand/10 p-3 text-sm">
          {message}
        </p>
      ) : null}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {events.map((event) => (
          <button className="rounded-2xl border p-4 text-left transition hover:border-brand/50" key={event.id} onClick={() => setSelected(event)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{event.customer}</p>
                <p className="mt-1 text-sm text-muted">{event.service}</p>
              </div>
              <span className="text-xs font-semibold text-brand">
                {event.date} · {event.timeMode === "CONFIRMED" ? "HORARIO CONFIRMADO" : "HORARIO ESTIMADO"} · {event.start}
              </span>
            </div>
            <p className="mt-3 text-sm">
              <MapPin className="mr-2 inline size-4 text-brand" />
              {event.address}, {event.district} · {event.venue}
            </p>
            <span className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-brand/40 bg-brand/10 px-3 text-sm font-semibold text-brand">TOMAR · Ver pago</span>
          </button>
        ))}
        {events.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            No hay responsabilidades disponibles por el momento.
          </p>
        ) : null}
      </div>
      {selected ? <MultiRoleEventPreview event={selected} requests={requests} pending={pending} close={() => setSelected(null)} request={request} /> : null}
      <h3 className="mt-7 font-semibold">Mis solicitudes</h3>
      <div className="mt-3 space-y-2">
        {requests.map((item) => (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
            key={item.id}
          >
            <span>
              {item.customer} ·{" "}
              {ROLE[item.responsibility] ?? item.responsibility}
            </span>
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
              {item.status === "PENDING"
                ? "Pendiente"
                : item.status === "APPROVED"
                  ? "Aprobada"
                  : item.status === "REJECTED"
                    ? "Rechazada"
                    : item.status === "CANCELLED"
                      ? "Cancelada"
                      : "Confirmada"}
            </span>
          </div>
        ))}
        {requests.length === 0 ? (
          <p className="text-sm text-muted">Aún no has enviado solicitudes.</p>
        ) : null}
      </div>
    </section>
  );
}

function AvailableEventPreview({event,requests,pending,close,request,setMessage}:{event:AvailableStaffEvent;requests:StaffRequest[];pending:boolean;close:()=>void;request:(projectId:string,role:string)=>void;setMessage:(message:string)=>void}) {
  const [role,setRole]=useState(event.available[0]??"");
  const [declining,setDeclining]=useState(false);
  const [reason,setReason]=useState("ILLNESS");
  const [detail,setDetail]=useState("");
  const [declinePending,startDecline]=useTransition();
  const maps=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${event.address}, ${event.district}`)}`;
  const roleNet=role==="OPERATOR"?event.payments.operator:role==="ASSEMBLY"?event.payments.assembly:role==="DISASSEMBLY"?event.payments.disassembly:event.payments.combined;
  const alreadyRequested=requests.some(item=>item.projectId===event.id&&item.responsibility===role&&item.status==="PENDING");
  const decline=()=>startDecline(async()=>{const form=new FormData();form.set("projectId",event.id);form.set("responsibility",role);form.set("reason",reason);form.set("detail",detail);const result=await declineStaffResponsibilityAction(form);setMessage(result.message);if(result.ok)close()});
  return <MobileDialog description="Revisa exactamente qué Evento, responsabilidad y pago estás aceptando." eyebrow="Antes de aceptar" onClose={close} size="xl" title="Resumen operacional completo" variant="fullscreen-mobile"><article><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Small label="Servicio" value={event.service}/><Small label="Cliente" value={event.customer}/><Small label="Fecha" value={event.date}/><Small label="Horario" value={`${event.start}–${event.finish}`}/><Small label="Duración" value={`${event.duration} horas`}/><Small label="Comuna" value={event.district}/><Small label="Dirección" value={event.address}/><Small label="Contacto cliente" value={event.clientPhone}/><Small label="Producción" value={`${event.productionContact} · ${event.productionPhone}`}/><Small label="Vehículo" value={event.vehicle}/><Small label="Equipamiento" value={event.equipment.join(" · ")||"No asignado"}/><Small label="ORBIT Event ID" value={event.orbitEventId}/></div><a className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold text-brand" href={maps} rel="noreferrer" target="_blank"><Navigation className="size-4"/>Google Maps</a><section className="mt-6 rounded-2xl border border-brand/30 bg-brand/5 p-4"><h4 className="font-semibold">Pago estimado de la asignación</h4><p className="mt-1 text-sm text-muted">Este es el pago estimado para esta asignación. Solo el Founder puede modificar estos valores.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Small label="Operador" value={money(event.payments.operator)}/><Small label="Montaje" value={money(event.payments.assembly)}/><Small label="Desmontaje" value={money(event.payments.disassembly)}/><Small label="Montaje + Desmontaje" value={money(event.payments.combined)}/><Small label="Bono transporte" value={money(event.payments.transportationBonus)}/><Small label="Reembolsos" value="Pendientes"/><Small label="Total estimado" value={money(roleNet+event.payments.transportationBonus)}/></div></section><section className="mt-6 rounded-2xl border p-4"><label className="grid gap-2 text-sm font-medium">Responsabilidad<select className="min-h-11 rounded-xl border bg-background px-3" value={role} onChange={e=>setRole(e.target.value)}>{event.available.map(value=><option key={value} value={value}>{ROLE[value]??value}</option>)}</select></label><div className="mt-4 flex flex-wrap gap-2"><button className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50" aria-busy={pending} disabled={pending||alreadyRequested||!role} onClick={()=>request(event.id,role)}>{alreadyRequested?"Solicitud pendiente":pending?"Enviando…":"TOMAR RESPONSABILIDAD"}</button><button className="min-h-11 rounded-xl border px-4 text-sm font-semibold text-danger" aria-busy={pending} disabled={pending} onClick={()=>setDeclining(value=>!value)}>Rechazar</button></div>{declining?<div className="mt-4 grid gap-3 border-t pt-4"><label className="grid gap-2 text-sm font-medium">Motivo<select className="min-h-11 rounded-xl border bg-background px-3" value={reason} onChange={e=>setReason(e.target.value)}><option value="ILLNESS">Enfermedad</option><option value="EMERGENCY">Emergencia</option><option value="UNAVAILABLE">No disponible</option><option value="DISTANCE">Distancia</option><option value="OTHER">Otro</option></select></label><label className="grid gap-2 text-sm font-medium">Detalle<textarea className="min-h-24 rounded-xl border bg-background p-3" required={reason==="OTHER"} value={detail} onChange={e=>setDetail(e.target.value)}/></label><button className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={declinePending||(reason==="OTHER"&&!detail.trim())} onClick={decline}>{declinePending?"Notificando…":"Confirmar rechazo"}</button></div>:null}</section></article></MobileDialog>
}
function MultiRoleEventPreview({event,requests,pending,close,request}:{event:AvailableStaffEvent;requests:StaffRequest[];pending:boolean;close:()=>void;request:(projectId:string,roles:string[])=>void}) {
  const [roles,setRoles]=useState<string[]>([]);
  const pendingRoles=new Set(requests.filter(item=>item.projectId===event.id&&item.status==="PENDING").map(item=>item.responsibility));
  const selectableRoles=event.available.filter(role=>["OPERATOR","ASSEMBLY","DISASSEMBLY"].includes(role));
  const amount=(role:string)=>role==="OPERATOR"?event.payments.operator:role==="ASSEMBLY"?event.payments.assembly:event.payments.disassembly;
  const roleTotal=roles.includes("ASSEMBLY")&&roles.includes("DISASSEMBLY")
    ? event.payments.combined + (roles.includes("OPERATOR") ? event.payments.operator : 0)
    : roles.reduce((sum,role)=>sum+amount(role),0);
  const total=roleTotal+event.payments.transportationBonus;
  return <MobileDialog description="Selecciona una o varias responsabilidades disponibles." eyebrow="Antes de aceptar" onClose={close} size="xl" title="Resumen operacional completo" variant="fullscreen-mobile"><article><div className="grid gap-3 sm:grid-cols-2"><Small label="Servicio" value={event.service}/><Small label="Fecha" value={event.date}/><Small label="Horario" value={`${event.start}–${event.finish}`}/><Small label="Comuna" value={event.district}/><Small label="ORBIT Event ID" value={event.orbitEventId}/></div><section className="mt-6 rounded-2xl border border-brand/30 bg-brand/5 p-4"><h4 className="font-semibold">Responsabilidades disponibles</h4><div className="mt-3 grid gap-2">{selectableRoles.map(role=>{const checked=roles.includes(role),requested=pendingRoles.has(role);return <label className={`flex min-h-11 items-center justify-between rounded-xl border px-3 ${requested?"opacity-60":""}`} key={role}><span><input className="mr-3 size-4" type="checkbox" checked={checked} aria-busy={pending} disabled={pending||requested} onChange={e=>setRoles(current=>e.target.checked?[...current,role]:current.filter(value=>value!==role))}/>{ROLE[role]??role}</span><span>{requested?"Solicitado":money(amount(role))}</span></label>})}</div><p className="mt-3 text-sm font-semibold">Total estimado: {money(total)}</p></section><div className="mt-5 flex flex-wrap gap-2"><button className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50" aria-busy={pending} disabled={pending||roles.length===0} onClick={()=>request(event.id,roles)}>{pending?"Enviando…":"Aceptar responsabilidades"}</button><button className="min-h-11 rounded-xl border px-4 text-sm font-semibold" aria-busy={pending} disabled={pending} onClick={close}>Cerrar</button></div></article></MobileDialog>;
}
function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof CalendarDays;
}) {
  return (
    <article className="rounded-2xl border bg-card p-5">
      <Icon className="size-5 text-brand" />
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </article>
  );
}
function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
function OperatorReadinessPanel({
  event,
  run,
}: {
  event: StaffPortalEvent;
  run: (action: () => Promise<{ ok: boolean; message: string }>) => void;
}) {
  const [category, setCategory] = useState<"EQUIPMENT" | "STAFF" | "CLIENT" | "DELAY" | "OTHER">("EQUIPMENT");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [description, setDescription] = useState("");
  const [reported, setReported] = useState(event.checklist.includes("OPERATOR_INCIDENT_REPORTED"));
  const allChecks = [...OPERATOR_PAPER_CHECKS, ...OPERATOR_EQUIPMENT_CHECKS];
  const completed = allChecks.filter((item) => event.checklist.includes(item.code)).length;
  const status = reported ? "CON INCIDENCIA" : completed === allChecks.length ? "OK" : "PENDIENTE";
  const statusClass = reported ? "border-red-500/40 text-red-400" : status === "OK" ? "border-emerald-500/40 text-emerald-400" : "border-brand/40 text-brand";
  const checklist = (title: string, items: typeof OPERATOR_PAPER_CHECKS) => <div className="rounded-xl border border-white/10 p-3"><p className="text-xs font-semibold uppercase tracking-[.14em] text-brand">{title}</p><div className="mt-2 grid gap-2">{items.map((item) => { const done = event.checklist.includes(item.code); return <button type="button" key={item.code} className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm ${done ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/10"}`} disabled={done} onClick={() => run(async () => { const result = await completeStaffChecklistItemAction(event.id, item.code); return result; })}><span aria-hidden="true">{done ? "☑" : "☐"}</span><span>{item.label}</span></button>; })}</div></div>;
  return <section className="mt-6 rounded-2xl border border-brand/30 bg-brand/5 p-4" aria-label="Checklist del operador"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Operación del operador</p><h3 className="mt-1 text-lg font-semibold">Checklist de apertura</h3><p className="mt-1 text-sm text-muted">Confirma papel y equipo antes de iniciar el servicio.</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}>{status}</span></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{checklist("Checklist de papel", OPERATOR_PAPER_CHECKS)}{checklist("Checklist de equipo", OPERATOR_EQUIPMENT_CHECKS)}</div><div className="mt-4 rounded-xl border border-red-500/20 p-3"><div className="flex items-center gap-2"><AlertTriangle className="size-4 text-red-400"/><p className="text-sm font-semibold">Reportar problema</p></div><p className="mt-1 text-xs text-muted">La observación es obligatoria y generará una alerta visible para Administración.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Categoría<select className="min-h-11 rounded-xl border bg-background px-3" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="EQUIPMENT">Equipo</option><option value="STAFF">Staff</option><option value="CLIENT">Cliente</option><option value="DELAY">Retraso</option><option value="OTHER">Otro</option></select></label><label className="grid gap-1 text-sm font-medium">Severidad<select className="min-h-11 rounded-xl border bg-background px-3" value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></label></div><textarea className="mt-3 min-h-24 w-full rounded-xl border bg-background p-3 text-sm" placeholder="Describe el problema observado" value={description} onChange={(event) => setDescription(event.target.value)} /><button type="button" className="mt-3 min-h-11 rounded-xl border border-red-500/40 px-4 text-sm font-semibold text-red-300 disabled:opacity-50" disabled={description.trim().length < 3} onClick={() => run(async () => { const result = await reportStaffOperatorIncidentAction({ projectId: event.id, category, severity, description }); if (result.ok) setReported(true); return result; })}>Guardar incidencia y alertar Administración</button></div></section>;
}

function EventDetail({
  event,
  close,
}: {
  event: StaffPortalEvent;
  close: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelRole, setCancelRole] = useState(event.roles[0] ?? "");
  const [cancelReason, setCancelReason] = useState("ILLNESS");
  const [cancelDetail, setCancelDetail] = useState("");
  const [rejecting,setRejecting]=useState(false),[rejectReason,setRejectReason]=useState("UNAVAILABLE"),[rejectDetail,setRejectDetail]=useState("");
  const actions = executionActions(event.roles);
  const next = actions.find((item) => !event.checkins.includes(item.code)),
    needsAcceptance = pendingAcceptance(event.status);
  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok) location.reload();
    });
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${event.address}, ${event.district}`)}`;
  const googleCalendar = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`BOOMBOX · ${event.customer}`)}&dates=${event.date.replaceAll("-", "")}T${event.start.replace(":", "")}00/${event.date.replaceAll("-", "")}T${event.finish.replace(":", "")}00&details=${encodeURIComponent(`Servicio: ${event.service}\nORBIT Event ID: ${event.orbitEventId}`)}&location=${encodeURIComponent(event.address)}`;
  const cancel = () => {
    const data = new FormData();
    data.set("projectId", event.id);
    data.set("responsibility", cancelRole);
    data.set("reasonCategory", cancelReason);
    data.set("reasonDetail", cancelDetail);
    run(() => cancelStaffAssignmentAction(data));
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <article className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-[#111214] p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:max-w-5xl sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
              Evento · paquete operacional
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{event.customer}</h2>
            <p className="mt-1 text-sm text-white/60">
              {event.eventType} · {event.service} · {event.duration} horas
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className="rounded-lg border p-2"
            onClick={close}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Small label="CITACIÓN" value={event.staffCallAt?new Date(event.staffCallAt).toLocaleString("es-CL",{timeZone:"America/Santiago"}):"Por confirmar"} />
          <Small label="SERVICIO" value={`${event.date} · ${event.start}–${event.finish}`} />
          <Small label="Lugar" value={event.venue} />
          <Small label="Dirección" value={event.address} />
          <Small label="Comuna" value={event.district} />
          <Small
            label="Extras"
            value={event.extras.join(" · ") || "Sin extras"}
          />
          <Small
            label="Encargado del evento"
            value={`${event.productionContact} · ${event.productionPhone}`}
          />
          <Small
            label="Responsabilidades"
            value={event.roles.map((role) => ROLE[role] ?? role).join(" + ")}
          />
          <Small label="Vehículo" value={event.vehicle} />
          <Small
            label="Equipamiento"
            value={event.equipment.join(" · ") || "No asignado"}
          />
          <Small label="ORBIT Event ID" value={event.orbitEventId} />
          <Small label="Estado" value={stateLabel(event)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground" href={maps}><Navigation className="size-4"/>VER UBICACIÓN</a>
          {event.productionPhone && event.productionPhone !== "Por confirmar" ? <a className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand/40 px-4 text-sm font-semibold text-brand" href={`tel:${event.productionPhone.replace(/[^+\d]/g, "")}`}><Phone className="size-4"/>CONTACTAR</a> : null}
        </div>
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-4">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Caja Negra</p>
            <h3 className="mt-2 font-semibold">Equipamiento del evento</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-white/70">
              {["Caja Negra", "Impresora", "Cámara", "Pantalla", "Operador", "Montaje", "Desmontaje"].map((item) => <span className="rounded-xl border border-white/10 px-3 py-2" key={item}>{item}</span>)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#191a1d] p-4">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Operación</p>
            <h3 className="mt-2 font-semibold">Estado del servicio</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {["CHECK-OUT", "EVENTO", "PAPEL", "CHECK-IN"].map((item) => <span className="rounded-full border border-white/10 px-3 py-2 text-center text-white/70" key={item}>{item}</span>)}
            </div>
            <p className="mt-3 text-xs text-white/45">El cierre de papel se completa desde el módulo operativo.</p>
          </div>
        </section>
        {event.logistics.length?<section className="mt-6 rounded-2xl border p-4"><h3 className="font-semibold">Mis viajes logísticos</h3><div className="mt-3 space-y-3">{event.logistics.map(trip=>{const nextStatus=trip.status==="PLANNED"?"IN_PROGRESS":trip.status==="IN_PROGRESS"?"ARRIVED":trip.status==="ARRIVED"?"COMPLETED":null;const nextLabel=nextStatus==="IN_PROGRESS"?"Iniciar viaje":nextStatus==="ARRIVED"?"Llegué":"Finalizar viaje";return <article className="rounded-xl border p-3" key={trip.id}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{trip.sequence}. {trip.type.replaceAll("_"," ")}</p><p className="text-sm text-muted">{trip.vehicle} · {trip.driver}</p></div><span className="rounded-full border px-2.5 py-1 text-xs font-semibold">{trip.status}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><Small label="Salida" value={trip.departure}/><Small label="Llegada estimada" value={trip.arrival}/><Small label="Punto de encuentro" value={trip.meetingPoint}/><Small label="Ruta" value={trip.route}/><Small label="Instrucciones" value={trip.instructions}/></div><div className="mt-3 flex flex-wrap gap-2">{nextStatus?<button className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50" aria-busy={pending} disabled={pending} onClick={()=>run(()=>updateStaffLogisticsTripAction(trip.id,nextStatus))}>{pending?"Actualizando…":nextLabel}</button>:<span className="text-sm font-semibold text-emerald-500">Viaje completado</span>}<a className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trip.route.split("→").at(-1)?.trim()??event.address)}`} rel="noreferrer" target="_blank"><Navigation className="size-4"/>Abrir en Maps</a></div></article>})}</div></section>:null}
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold text-brand"
            href={maps}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation className="size-4" />
            Iniciar navegación
          </a>
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
            href={googleCalendar}
            target="_blank"
            rel="noreferrer"
          >
            <CalendarDays className="size-4" />
            Google Calendar
          </a>
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
            href={`/api/staff-portal/events/${event.id}/calendar`}
          >
            <Download className="size-4" />
            Apple / Outlook
          </a>
        </div>
        {needsAcceptance ? (
          <section className="mt-6 rounded-2xl border border-brand/30 bg-brand/5 p-4">
            <h3 className="font-semibold">Nueva asignación</h3>
            <p className="mt-1 text-sm text-muted">
              Confirma que recibiste el paquete operacional completo.
            </p>
            <button
              className="mt-4 min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50"
              aria-busy={pending} disabled={pending}
              onClick={() => run(() => acceptStaffAssignmentAction(event.id))}
            >
              {pending ? "Confirmando…" : "Aceptar asignación"}
            </button>
            <button className="mt-4 min-h-11 rounded-xl border border-red-500/40 px-4 text-sm font-semibold text-red-600" aria-busy={pending} disabled={pending} onClick={()=>setRejecting(value=>!value)}>Rechazar asignación</button>
            {rejecting?<div className="mt-4 grid gap-3 border-t pt-4"><label className="grid gap-2 text-sm font-medium">Motivo<select className="min-h-11 rounded-xl border bg-background px-3" value={rejectReason} onChange={event=>setRejectReason(event.target.value)}><option value="ILLNESS">Enfermedad</option><option value="EMERGENCY">Emergencia</option><option value="UNAVAILABLE">No disponible</option><option value="DISTANCE">Distancia</option><option value="OTHER">Otro</option></select></label><label className="grid gap-2 text-sm font-medium">Detalle<textarea className="min-h-24 rounded-xl border bg-background p-3" required value={rejectDetail} onChange={event=>setRejectDetail(event.target.value)}/></label><button className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50" aria-busy={pending} disabled={pending||!rejectDetail.trim()} onClick={()=>{const form=new FormData();form.set("projectId",event.id);form.set("reason",rejectReason);form.set("detail",rejectDetail);run(()=>rejectAssignedStaffAssignmentAction(form))}}>Confirmar rechazo</button></div>:null}
          </section>
        ) : (
          <>
            <section className="mt-6 rounded-2xl border p-4">
              <h3 className="font-semibold">Checklist antes del Evento</h3>
              <div className="mt-3 space-y-2">
                {PRE_EVENT.map((item) => {
                  const done = event.checklist.includes(item.code);
                  return (
                    <button
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm ${done ? "border-emerald-500/30 bg-emerald-500/10" : ""}`}
                      aria-busy={pending} disabled={pending|| done}
                      key={item.code}
                      onClick={() =>
                        run(() =>
                          completeStaffChecklistItemAction(event.id, item.code),
                        )
                      }
                    >
                      <span>{done ? "☑" : "☐"}</span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>
            {event.roles.includes("OPERATOR") ? <OperatorReadinessPanel event={event} run={run} /> : null}
            <section className="mt-6 rounded-2xl border p-4">
              <h3 className="font-semibold">Estado operacional</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {actions.map((item) => (
                  <span
                    className={`rounded-full border px-3 py-1.5 text-xs ${event.checkins.includes(item.code) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "text-muted"}`}
                    key={item.code}
                  >
                    {event.checkins.includes(item.code) ? "✓ " : ""}
                    {item.label}
                  </span>
                ))}
              </div>
              {next ? (
                <button
                  className="mt-4 min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50"
                  aria-busy={pending} disabled={pending}
                  onClick={() =>
                    run(() => recordStaffCheckInAction(event.id, next.code))
                  }
                >
                  {pending ? "Actualizando…" : next.label}
                </button>
              ) : (
                <p className="mt-4 text-sm font-semibold text-emerald-500">
                  Evento completado
                </p>
              )}
            </section>
          </>
        )}
        {!participationCompleted(event) ? (
          <section className="mt-6 rounded-2xl border border-danger/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">¿No puedes asistir?</h3>
                <p className="mt-1 text-sm text-muted">
                  Cancela con motivo obligatorio. El Founder recibirá una alerta
                  crítica inmediatamente.
                </p>
              </div>
              <button
                className="min-h-10 rounded-xl border border-danger/30 px-3 text-sm font-semibold text-danger"
                onClick={() => setCancelling((value) => !value)}
              >
                Cancelar asignación
              </button>
            </div>
            {cancelling ? (
              <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Responsabilidad
                  <select
                    className="min-h-11 rounded-xl border bg-background px-3"
                    value={cancelRole}
                    onChange={(event) => setCancelRole(event.target.value)}
                  >
                    {event.roles.map((item) => (
                      <option key={item} value={item}>
                        {ROLE[item] ?? item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Motivo
                  <select
                    className="min-h-11 rounded-xl border bg-background px-3"
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                  >
                    <option value="ILLNESS">Enfermedad</option>
                    <option value="EMERGENCY">Emergencia</option>
                    <option value="FAMILY">Familiar</option>
                    <option value="VEHICLE">Vehículo</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium sm:col-span-2">
                  Detalle
                  <textarea
                    className="min-h-24 rounded-xl border bg-background p-3"
                    placeholder="Información útil para que BOOMBOX reorganice el Evento"
                    required={cancelReason === "OTHER"}
                    value={cancelDetail}
                    onChange={(event) => setCancelDetail(event.target.value)}
                  />
                </label>
                <button
                  className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
                  disabled={
                    pending ||
                    !cancelRole ||
                    (cancelReason === "OTHER" && !cancelDetail.trim())
                  }
                  onClick={cancel}
                >
                  {pending ? "Notificando…" : "Confirmar cancelación"}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
        {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <StaffConsumablesPanel projectId={event.id} />
          <StaffBoxOperationsPanel projectId={event.id} operatorCloseoutEnabled={event.roles.includes("OPERATOR")} />
          <div className="rounded-2xl border p-4">
            <h3 className="font-semibold">Documentos operacionales</h3>
            <div className="mt-3 space-y-2">
              {event.documents.map((doc) => (
                <a
                  className="flex min-h-10 items-center justify-between rounded-lg border px-3 text-sm"
                  href={`/api/staff-portal/documents/${doc.id}`}
                  key={doc.id}
                >
                  <span>{doc.type}</span>
                  <Download className="size-4 text-brand" />
                </a>
              ))}
              {event.documents.length === 0 ? (
                <p className="text-sm text-muted">
                  Sin documentos operacionales disponibles.
                </p>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border p-4">
            <h3 className="font-semibold">Información Operacional</h3>
            <dl className="mt-3 space-y-3 text-sm">
              {[
                ["Observaciones operacionales", event.operationalInformation.observations],
                ["Instrucciones especiales", event.operationalInformation.specialInstructions],
                ["Equipamiento", event.operationalInformation.equipmentNotes],
                ["Montaje", event.operationalInformation.setupNotes],
                ["Emergencias", event.operationalInformation.emergencyNotes],
              ].map(([label, detail]) => (
                <div key={label}>
                  <dt className="font-medium text-foreground">{label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-muted">
                    {detail || "Sin información adicional."}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </article>
    </div>
  );
}

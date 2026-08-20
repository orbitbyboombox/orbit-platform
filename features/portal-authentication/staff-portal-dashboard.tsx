"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  MapPin,
  Navigation,
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
  requestStaffResponsibilityAction,
  updateStaffLogisticsTripAction,
  submitStaffExpenseAction,
} from "./staff-portal.actions";
import { MobileDialog } from "@/components/ui/mobile-dialog";

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
export type StaffExpenseSubmission = { id:string;projectId:string;category:string;amount:number;occurredOn:string;description:string;status:string;rejectionReason:string };
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
const pendingAcceptance = (status: string) =>
  ["PENDING", "PENDING_CONFIRMATION", "ASSIGNED"].includes(status);
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
  requests,
  expenseSubmissions,
  mustChangePassword,
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
  requests: StaffRequest[];
  expenseSubmissions: StaffExpenseSubmission[];
  mustChangePassword: boolean;
}) {
  const [selected, setSelected] = useState<StaffPortalEvent | null>(null);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
  const todayEvents = events.filter((event) => event.date === today),
    completed = events.filter((event) =>
      participationCompleted(event),
    ),
    confirmed = events.filter(
      (event) =>
        !pendingAcceptance(event.status) &&
        !participationCompleted(event),
    );
  if (mustChangePassword) return <PasswordSetup name={name} />;
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          Portal Staff
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Bienvenido, {name}.</h1>
        <p className="mt-2 text-muted">
          Solicita responsabilidades disponibles y opera tus eventos
          confirmados.
        </p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-brand/30 bg-brand/10 px-4 text-sm font-semibold text-brand"
          href="/staff-portal/academy"
        >
          🎓 BOOMBOX Academy
        </Link>
      </header>
      <StaffExpenseSubmissionPanel events={events} submissions={expenseSubmissions} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Eventos de hoy"
          value={String(todayEvents.length)}
          icon={CalendarDays}
        />
        <Metric
          label="Próximos 15 días"
          value={String(events.length)}
          icon={Clock3}
        />
        <Metric
          label="Eventos disponibles"
          value={String(availableEvents.length)}
          icon={ChevronRight}
        />
        <Metric
          label="Eventos confirmados"
          value={String(confirmed.length)}
          icon={CheckCircle2}
        />
        <Metric
          label="Eventos completados"
          value={String(completed.length)}
          icon={CheckCircle2}
        />
      </section>
      <AvailableEvents events={availableEvents} requests={requests} />
      <section className="rounded-3xl border bg-card p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Mis eventos asignados</h2>
        <p className="mt-1 text-sm text-muted">
          Las asignaciones nuevas aparecen primero y requieren tu aceptación.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {events.map((event) => (
            <button
              className="rounded-2xl border p-4 text-left transition hover:border-brand/50"
              key={event.id}
              onClick={() => setSelected(event)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{event.customer}</p>
                  <p className="mt-1 text-sm text-muted">
                    {event.eventType} · {event.service}
                  </p>
                </div>
                <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                  {stateLabel(event)}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <CalendarDays className="mr-2 inline size-4 text-brand" />
                  {event.date}
                </p>
                <p>
                  <Clock3 className="mr-2 inline size-4 text-brand" />
                  {event.start}–{event.finish}
                </p>
                <p className="sm:col-span-2">
                  <MapPin className="mr-2 inline size-4 text-brand" />
                  {event.address}, {event.district}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
                <span>
                  {event.roles.map((role) => ROLE[role] ?? role).join(" + ")}
                </span>
                <strong>{money(event.net)}</strong>
              </div>
            </button>
          ))}
          {events.length === 0 ? (
            <p className="py-8 text-sm text-muted">
              No tienes eventos asignados durante los próximos 15 días.
            </p>
          ) : null}
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-5 sm:p-7">
          <h2 className="text-xl font-semibold">Mis pagos del mes</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Small label="Generado" value={money(payment.generated)} />
            <Small label="Ya pagado" value={money(payment.paid)} />
            <Small label="Pago pendiente" value={money(payment.pending)} />
            <Small label="Boleta SII" value={payment.receiptStatus} />
          </div>
          <p className="mt-4 text-xs text-muted">
            Información de solo lectura. Los pagos son gestionados por el
            Founder.
          </p>
        </div>
        <div className="rounded-3xl border bg-card p-5 sm:p-7">
          <h2 className="text-xl font-semibold">
            Notificaciones operacionales
          </h2>
          <div className="mt-4 space-y-3">
            {notifications.map((item) => (
              <div className="rounded-xl border p-3" key={item.id}>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-muted">{item.message}</p>
                <p className="mt-2 text-xs text-muted">{item.date}</p>
              </div>
            ))}
            {notifications.length === 0 ? (
              <p className="text-sm text-muted">
                Sin notificaciones operacionales pendientes.
              </p>
            ) : null}
          </div>
        </div>
      </section>
      {selected ? (
        <EventDetail event={selected} close={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
function StaffExpenseSubmissionPanel({events,submissions}:{events:StaffPortalEvent[];submissions:StaffExpenseSubmission[]}) {
  const [open,setOpen]=useState(false),[pending,start]=useTransition(),[message,setMessage]=useState("");
  const submit=(form:FormData)=>start(async()=>{const result=await submitStaffExpenseAction(form);setMessage(result.message);if(result.ok){setOpen(false);location.reload();}});
  return <section className="rounded-3xl border border-brand/30 bg-brand/5 p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Reembolsos y gastos autorizados</p><h2 className="mt-1 text-xl font-semibold">Sube tu gasto</h2><p className="mt-1 text-sm text-muted">Adjunta el comprobante. No impactará finanzas hasta que el Founder lo apruebe.</p></div><button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground" onClick={()=>setOpen(true)}><Upload className="size-4"/>Sube tu gasto</button></div>{message?<p className="mt-4 rounded-xl border bg-card p-3 text-sm">{message}</p>:null}<div className="mt-4 grid gap-2 sm:grid-cols-2">{submissions.map(item=><div className="rounded-xl border bg-card p-3 text-sm" key={item.id}><div className="flex justify-between gap-3"><strong>{item.category}</strong><strong>{money(item.amount)}</strong></div><p className="mt-1 text-muted">{item.occurredOn} · {item.status==="PENDING_REVIEW"?"PENDIENTE":item.status==="APPROVED"?"APROBADO":item.status==="REJECTED"?"RECHAZADO":item.status}</p>{item.rejectionReason?<p className="mt-1 text-red-600">Motivo: {item.rejectionReason}</p>:null}</div>)}</div>{open?<MobileDialog description="Selecciona uno de tus Eventos asignados y adjunta el comprobante." eyebrow="Portal Staff" onClose={()=>setOpen(false)} size="lg" title="Sube tu gasto" variant="fullscreen-mobile"><form action={submit} className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Evento asignado<select className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" defaultValue={events.length===1?events[0]?.id:""} name="projectId" required><option value="">Seleccionar Evento</option>{events.map(event=><option key={event.id} value={event.id}>{event.date} · {event.customer} · {event.service}</option>)}</select></label><label className="text-sm font-medium">Categoría<select className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="category" required><option value="UBER_TRANSPORT">Uber / transporte</option><option value="FOOD">Comida</option><option value="PARKING">Estacionamiento</option><option value="TOLLS">Peaje</option><option value="MOBILITY">Movilización</option><option value="OTHER">Otro</option></select></label><label className="text-sm font-medium">Monto<input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" min="1" name="amount" required type="number"/></label><label className="text-sm font-medium">Fecha<input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="occurredOn" required type="date"/></label><label className="text-sm font-medium">Método<select className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="paymentMethod"><option value="PERSONAL_CARD">Tarjeta personal</option><option value="CASH">Efectivo</option><option value="COMPANY_CARD">Tarjeta empresa</option><option value="OTHER">Otro</option></select></label><label className="text-sm font-medium sm:col-span-2">Responsable del pago<select className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="expenseOwner"><option value="REIMBURSEMENT">Lo pagué yo, requiere reembolso</option><option value="COMPANY_PAID">Lo pagó BOOMBOX directamente</option></select></label><label className="text-sm font-medium sm:col-span-2">Descripción<input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="description" placeholder="Obligatoria para Otro"/></label><label className="text-sm font-medium sm:col-span-2">Observación<textarea className="mt-2 min-h-20 w-full rounded-xl border bg-background p-3" name="notes"/></label><label className="text-sm font-medium sm:col-span-2">Comprobante<input accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="mt-2 block w-full rounded-xl border bg-background p-2" name="receipt" required type="file"/></label><button className="min-h-12 rounded-xl bg-brand px-5 font-semibold text-brand-foreground sm:col-span-2" disabled={pending}>{pending?"Enviando…":"Enviar a revisión"}</button></form></MobileDialog>:null}</section>;
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
          disabled={pending}
        >
          {pending ? "Guardando…" : "Crear contraseña y continuar"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </section>
  );
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
  const request = (projectId: string, role: string) =>
    start(async () => {
      const result = await requestStaffResponsibilityAction(projectId, role);
      setMessage(result.message);
      if (result.ok) location.reload();
    });
  return (
    <section className="rounded-3xl border bg-card p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Eventos disponibles</h2>
      <p className="mt-1 text-sm text-muted">
        Solo aparecen eventos publicados por el Founder y responsabilidades aún
        disponibles.
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
                {event.date} · {event.start}
              </span>
            </div>
            <p className="mt-3 text-sm">
              <MapPin className="mr-2 inline size-4 text-brand" />
              {event.address}, {event.district} · {event.venue}
            </p>
            <span className="mt-4 inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold text-brand">Ver resumen y pago</span>
          </button>
        ))}
        {events.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            No hay responsabilidades disponibles por el momento.
          </p>
        ) : null}
      </div>
      {selected ? <AvailableEventPreview event={selected} requests={requests} pending={pending} close={() => setSelected(null)} request={request} setMessage={setMessage} /> : null}
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
  return <MobileDialog description="Revisa exactamente qué Evento, responsabilidad y pago estás aceptando." eyebrow="Antes de aceptar" onClose={close} size="xl" title="Resumen operacional completo" variant="fullscreen-mobile"><article><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Small label="Servicio" value={event.service}/><Small label="Cliente" value={event.customer}/><Small label="Fecha" value={event.date}/><Small label="Horario" value={`${event.start}–${event.finish}`}/><Small label="Duración" value={`${event.duration} horas`}/><Small label="Comuna" value={event.district}/><Small label="Dirección" value={event.address}/><Small label="Contacto cliente" value={event.clientPhone}/><Small label="Producción" value={`${event.productionContact} · ${event.productionPhone}`}/><Small label="Vehículo" value={event.vehicle}/><Small label="Equipamiento" value={event.equipment.join(" · ")||"No asignado"}/><Small label="ORBIT Event ID" value={event.orbitEventId}/></div><a className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold text-brand" href={maps} rel="noreferrer" target="_blank"><Navigation className="size-4"/>Google Maps</a><section className="mt-6 rounded-2xl border border-brand/30 bg-brand/5 p-4"><h4 className="font-semibold">Pago estimado de la asignación</h4><p className="mt-1 text-sm text-muted">Este es el pago estimado para esta asignación. Solo el Founder puede modificar estos valores.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Small label="Operador" value={money(event.payments.operator)}/><Small label="Montaje" value={money(event.payments.assembly)}/><Small label="Desmontaje" value={money(event.payments.disassembly)}/><Small label="Montaje + Desmontaje" value={money(event.payments.combined)}/><Small label="Bono transporte" value={money(event.payments.transportationBonus)}/><Small label="Reembolsos" value="Pendientes"/><Small label="Total estimado" value={money(roleNet+event.payments.transportationBonus)}/></div></section><section className="mt-6 rounded-2xl border p-4"><label className="grid gap-2 text-sm font-medium">Responsabilidad<select className="min-h-11 rounded-xl border bg-background px-3" value={role} onChange={e=>setRole(e.target.value)}>{event.available.map(value=><option key={value} value={value}>{ROLE[value]??value}</option>)}</select></label><div className="mt-4 flex flex-wrap gap-2"><button className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50" disabled={pending||alreadyRequested||!role} onClick={()=>request(event.id,role)}>{alreadyRequested?"Solicitud pendiente":pending?"Enviando…":"Aceptar Evento"}</button><button className="min-h-11 rounded-xl border px-4 text-sm font-semibold text-danger" disabled={pending} onClick={()=>setDeclining(value=>!value)}>Rechazar</button></div>{declining?<div className="mt-4 grid gap-3 border-t pt-4"><label className="grid gap-2 text-sm font-medium">Motivo<select className="min-h-11 rounded-xl border bg-background px-3" value={reason} onChange={e=>setReason(e.target.value)}><option value="ILLNESS">Enfermedad</option><option value="EMERGENCY">Emergencia</option><option value="UNAVAILABLE">No disponible</option><option value="DISTANCE">Distancia</option><option value="OTHER">Otro</option></select></label><label className="grid gap-2 text-sm font-medium">Detalle<textarea className="min-h-24 rounded-xl border bg-background p-3" required={reason==="OTHER"} value={detail} onChange={e=>setDetail(e.target.value)}/></label><button className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={declinePending||(reason==="OTHER"&&!detail.trim())} onClick={decline}>{declinePending?"Notificando…":"Confirmar rechazo"}</button></div>:null}</section></article></MobileDialog>
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
      <article className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border bg-card p-5 sm:max-w-4xl sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
              Paquete operacional
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{event.customer}</h2>
            <p className="mt-1 text-sm text-muted">
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
            label="Cliente"
            value={`${event.customer} · ${event.clientPhone}`}
          />
          <Small
            label="Producción"
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
          <Small label="Pago neto" value={money(event.net)} />
          <Small label="Estado" value={stateLabel(event)} />
        </div>
        {event.logistics.length?<section className="mt-6 rounded-2xl border p-4"><h3 className="font-semibold">Mis viajes logísticos</h3><div className="mt-3 space-y-3">{event.logistics.map(trip=>{const nextStatus=trip.status==="PLANNED"?"IN_PROGRESS":trip.status==="IN_PROGRESS"?"ARRIVED":trip.status==="ARRIVED"?"COMPLETED":null;const nextLabel=nextStatus==="IN_PROGRESS"?"Iniciar viaje":nextStatus==="ARRIVED"?"Llegué":"Finalizar viaje";return <article className="rounded-xl border p-3" key={trip.id}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{trip.sequence}. {trip.type.replaceAll("_"," ")}</p><p className="text-sm text-muted">{trip.vehicle} · {trip.driver}</p></div><span className="rounded-full border px-2.5 py-1 text-xs font-semibold">{trip.status}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><Small label="Salida" value={trip.departure}/><Small label="Llegada estimada" value={trip.arrival}/><Small label="Punto de encuentro" value={trip.meetingPoint}/><Small label="Ruta" value={trip.route}/><Small label="Instrucciones" value={trip.instructions}/></div><div className="mt-3 flex flex-wrap gap-2">{nextStatus?<button className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50" disabled={pending} onClick={()=>run(()=>updateStaffLogisticsTripAction(trip.id,nextStatus))}>{pending?"Actualizando…":nextLabel}</button>:<span className="text-sm font-semibold text-emerald-500">Viaje completado</span>}<a className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trip.route.split("→").at(-1)?.trim()??event.address)}`} rel="noreferrer" target="_blank"><Navigation className="size-4"/>Abrir en Maps</a></div></article>})}</div></section>:null}
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
              disabled={pending}
              onClick={() => run(() => acceptStaffAssignmentAction(event.id))}
            >
              {pending ? "Confirmando…" : "Aceptar asignación"}
            </button>
            <button className="mt-4 min-h-11 rounded-xl border border-red-500/40 px-4 text-sm font-semibold text-red-600" disabled={pending} onClick={()=>setRejecting(value=>!value)}>Rechazar asignación</button>
            {rejecting?<div className="mt-4 grid gap-3 border-t pt-4"><label className="grid gap-2 text-sm font-medium">Motivo<select className="min-h-11 rounded-xl border bg-background px-3" value={rejectReason} onChange={event=>setRejectReason(event.target.value)}><option value="ILLNESS">Enfermedad</option><option value="EMERGENCY">Emergencia</option><option value="UNAVAILABLE">No disponible</option><option value="DISTANCE">Distancia</option><option value="OTHER">Otro</option></select></label><label className="grid gap-2 text-sm font-medium">Detalle<textarea className="min-h-24 rounded-xl border bg-background p-3" required value={rejectDetail} onChange={event=>setRejectDetail(event.target.value)}/></label><button className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={pending||!rejectDetail.trim()} onClick={()=>{const form=new FormData();form.set("projectId",event.id);form.set("reason",rejectReason);form.set("detail",rejectDetail);run(()=>rejectAssignedStaffAssignmentAction(form))}}>Confirmar rechazo</button></div>:null}
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
                      disabled={pending || done}
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
                  disabled={pending}
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

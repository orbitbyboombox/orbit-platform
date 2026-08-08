"use client";

import {
  BadgeCheck,
  Camera,
  CalendarClock,
  CircleAlert,
  Clock3,
  HandHelping,
  Sparkles,
  UserCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { SectionTitle } from "@/components/layout/section-title";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataStateBadge } from "@/components/ui/data-state-badge";
import { SearchBar } from "@/components/forms/search-bar";
import { respondToStaffAssignmentAction } from "../actions";
import type {
  StaffManagementSnapshot,
  StaffMember,
  StaffResponseStatus,
  StaffStatus,
  StaffType,
} from "../types/staff-management.types";
import { StaffImport } from "../import/staff-import";
import { LiveExpenseCapture } from "@/features/expense-capture/components/live-expense-capture";

const STAFF_TYPE_LABEL: Record<StaffType, string> = {
  OPERATOR: "Operador",
  INSTALLATION: "Equipo de instalación",
  REMOVAL: "Equipo de retiro",
  ADMINISTRATOR: "Administrador",
  FUTURE: "Futuros roles",
};

const STAFF_STATUS: Record<StaffStatus, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Activo", variant: "success" },
  VACATION: { label: "Vacaciones", variant: "warning" },
  MEDICAL_LEAVE: { label: "Licencia médica", variant: "danger" },
  INACTIVE: { label: "Inactivo", variant: "neutral" },
};

const CAPABILITY_LABEL = { ASSEMBLY: "Montaje", OPERATOR: "Operación", DISASSEMBLY: "Desmontaje" } as const;
const SPECIALIZATION_LABEL = { CLASSIC: "Classic", POLAROID: "Polaroid", BLACK_STUDIO: "Black Studio", BBOX360: "BBOX360", LIGHTBOX: "LightBox", BOOMBALL: "BoomBall", HASHTAG: "Hashtag", INSTABOX: "Instabox", VIDEO_LOUNGE: "Video Lounge" } as const;

const RESPONSE_STATUS: Record<StaffResponseStatus, { label: string; variant: "success" | "warning" | "danger" | "info" }> = {
  PENDING: { label: "Respuesta pendiente", variant: "warning" },
  ACCEPTED: { label: "Aceptado · Pendiente BOOMBOX", variant: "info" },
  REJECTED: { label: "Rechazado", variant: "danger" },
  ASSISTANCE_REQUESTED: { label: "Asistencia solicitada", variant: "warning" },
};

const currency = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

interface DefinitionProps {
  label: string;
  value: string;
}

function Definition({ label, value }: DefinitionProps) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-sm font-medium leading-5">{value}</dd></div>;
}

interface StaffMemberCardProps {
  member: StaffMember;
  response?: StaffResponseStatus;
  onRespond: (memberId: string, response: StaffResponseStatus) => void;
}

function StaffMemberCard({ member, onRespond, response }: StaffMemberCardProps) {
  const { employment, financial, history, profile, today } = member;
  const currentResponse = response ?? today?.responseStatus;
  const status = STAFF_STATUS[profile.status];

  return (
    <SmartCard
      icon={<UserRound aria-hidden="true" className="size-5" />}
      primaryValue={`${profile.firstName} ${profile.lastName}`}
      secondaryValue={`${STAFF_TYPE_LABEL[employment.staffType]} · ${employment.availability}`}
      status={<StatusBadge label={status.label} variant={status.variant} />}
      title="Perfil de Staff"
    >
      <div className="space-y-6">
        {today && (
          <section aria-label="Operación de hoy" className="rounded-xl border border-border/70 bg-accent/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h4 className="text-sm font-semibold">Operación de hoy</h4><p className="mt-1 text-sm text-muted">{today.eventName}</p></div>
              {currentResponse && <StatusBadge label={RESPONSE_STATUS[currentResponse].label} variant={RESPONSE_STATUS[currentResponse].variant} />}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Definition label="Hora de llamado" value={today.callTime} />
              <Definition label="Salida" value={today.departureTime} />
              <Definition label="Vehículo" value={today.vehicle} />
              <Definition label="Black Box" value={today.blackBox} />
              <Definition label="Cabina" value={today.booth} />
            </dl>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
              <ActionButton className="min-h-11" icon={BadgeCheck} label="Aceptar evento" onClick={() => onRespond(profile.id, "ACCEPTED")} type="button" />
              <ActionButton className="min-h-11" icon={X} label="Rechazar evento" onClick={() => onRespond(profile.id, "REJECTED")} type="button" variant="outline" />
              <ActionButton className="min-h-11" icon={HandHelping} label="Solicitar asistencia" onClick={() => onRespond(profile.id, "ASSISTANCE_REQUESTED")} type="button" variant="outline" />
            </div>
          </section>
        )}

        <details className="group border-t pt-5">
          <summary className="cursor-pointer list-none rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60">Ver perfil, disponibilidad e historial</summary>
          <div className="mt-5 space-y-6 border-t pt-5"><section aria-label="Datos personales">
          <h4 className="text-sm font-semibold">Datos personales</h4>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Definition label="RUT" value={profile.rut} />
            <Definition label="Teléfono" value={profile.phone} />
            <Definition label="Correo" value={profile.email} />
            <Definition label="Dirección" value={profile.address} />
            <Definition label="Comuna" value={profile.commune} />
            <Definition label="Fecha de ingreso" value={profile.startDate} />
            <Definition label="Contacto de emergencia" value={`${profile.emergencyContact.name} · ${profile.emergencyContact.phone}`} />
          </dl>
        </section>

        <section aria-label="Datos laborales" className="border-t pt-5">
          <h4 className="text-sm font-semibold">Datos laborales</h4>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Definition label="Tarifa evento" value={currency.format(employment.dailyEventRate)} />
            <Definition label="Tarifa instalación" value={currency.format(employment.installationRate)} />
            <Definition label="Tarifa retiro" value={currency.format(employment.removalRate)} />
            <Definition label="Licencia de conducir" value={employment.drivingLicense ?? "No registrada"} />
            <Definition label="Puede conducir vehículo BOOMBOX" value={employment.canDriveCompanyVehicle ? "Sí" : "No"} />
            <Definition label="Observaciones" value={employment.observations ?? "Sin observaciones"} />
          </dl>
        </section>

        <section aria-label="Capacidades operacionales" className="border-t pt-5">
          <h4 className="text-sm font-semibold">Capacidades operacionales</h4>
          <p className="mt-2 text-xs text-muted">Clasificación {employment.classification ?? "Sin clasificar"}. La asignación final siempre corresponde a Operaciones.</p>
          <div className="mt-4 flex flex-wrap gap-2">{Object.entries(CAPABILITY_LABEL).map(([key, label]) => <StatusBadge key={key} label={label} variant={employment.capabilities.includes(key as keyof typeof CAPABILITY_LABEL) ? "success" : "neutral"} />)}</div>
          <div className="mt-4 flex flex-wrap gap-2">{employment.specializations.length ? employment.specializations.map((item) => <StatusBadge key={item} label={SPECIALIZATION_LABEL[item]} variant="info" />) : <span className="text-sm text-muted">Sin especializaciones registradas.</span>}</div>
        </section>

        <section aria-label="Historial de eventos" className="border-t pt-5">
          <h4 className="text-sm font-semibold">Historial de eventos</h4>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
            <Definition label="Completados" value={history.completedEvents.toString()} />
            <Definition label="Aceptados" value={history.acceptedEvents.toString()} />
            <Definition label="Rechazados" value={history.rejectedEvents.toString()} />
            <Definition label="Atrasos" value={history.lateArrivals.toString()} />
            <Definition label="Asignaciones actuales" value={history.currentAssignments.toString()} />
            <Definition label="Próximas asignaciones" value={history.upcomingAssignments.toString()} />
          </dl>
        </section></div></details>

        <section aria-label="Resumen de costos" className="border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h4 className="text-sm font-semibold">Resumen de costos del equipo</h4><p className="mt-1 text-xs text-muted">Estimación asociada a esta operación.</p></div>
            <p className="text-2xl font-semibold tracking-tight">{currency.format(financial.totalStaffCost)}</p>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <Definition label="Operación" value={currency.format(financial.operatorCost)} />
            <Definition label="Instalación" value={currency.format(financial.installationCost)} />
            <Definition label="Retiro" value={currency.format(financial.removalCost)} />
          </dl>
        </section>
      </div>
    </SmartCard>
  );
}

export interface StaffManagementProps {
  snapshot: StaffManagementSnapshot;
}

export function StaffManagement({ snapshot }: StaffManagementProps) {
  const [responses, setResponses] = useState<Record<string, StaffResponseStatus>>({});
  const [announcement, setAnnouncement] = useState("");
  const [query, setQuery] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const { indicators, recommendation } = snapshot;
  const visibleMembers = snapshot.members.filter(({ employment, profile }) => `${profile.firstName} ${profile.lastName} ${STAFF_TYPE_LABEL[employment.staffType]} ${employment.availability}`.toLocaleLowerCase("es-CL").includes(query.toLocaleLowerCase("es-CL")));

  async function handleResponse(memberId: string, response: StaffResponseStatus) {
    const member = snapshot.members.find(({ profile }) => profile.id === memberId);
    if (!member?.today || response === "PENDING") return;
    const result = await respondToStaffAssignmentAction(member.today.id, response);
    if (!result.ok) { setAnnouncement(result.error); return; }
    setResponses((current) => ({ ...current, [memberId]: response }));
    const message = response === "ACCEPTED"
      ? "Evento aceptado. La asignación continúa pendiente de aprobación BOOMBOX."
      : response === "REJECTED"
        ? "Evento rechazado. BOOMBOX debe revisar la planificación."
        : "Solicitud de asistencia enviada para revisión de BOOMBOX.";
    setAnnouncement(message);
  }

  return (
    <div className="space-y-10 lg:space-y-12">
      <header className="rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
        <p className="text-sm font-medium text-brand">RECURSOS · EQUIPO</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Gestión de Staff</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">Perfiles, disponibilidad y respuesta operacional de todos los colaboradores BOOMBOX.</p>
        <ActionButton className="mt-6" icon={Camera} label="Subir gasto" onClick={()=>setExpenseOpen(true)} />
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {Object.values(STAFF_TYPE_LABEL).map((label) => <StatusBadge key={label} label={label} variant="neutral" />)}
        </div>
      </header>

      <section aria-label="Indicadores del equipo" className="hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        <SmartCard icon={<UsersRound aria-hidden="true" className="size-5" />} primaryValue={indicators.totalStaff.toString()} secondaryValue="Colaboradores registrados" title="Staff total" />
        <SmartCard icon={<UserCheck aria-hidden="true" className="size-5" />} primaryValue={indicators.availableStaff.toString()} secondaryValue="Listos para una operación" status={<StatusBadge label="Disponible" variant="success" />} title="Disponibilidad de Staff" />
        <SmartCard icon={<CalendarClock aria-hidden="true" className="size-5" />} primaryValue={`${indicators.capacityPercentage}%`} secondaryValue={`${indicators.assignedStaff} colaboradores asignados`} title="Capacidad de Staff" />
        <SmartCard icon={<CircleAlert aria-hidden="true" className="size-5" />} primaryValue={indicators.activeAlerts.toString()} secondaryValue="Requieren revisión BOOMBOX" status={<StatusBadge label="Atención" variant="warning" />} title="Alertas de Staff" />
      </section>
      <section aria-label="Resumen compacto del equipo" className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border bg-card sm:hidden">
        <div className="px-3 py-4 text-center"><p className="text-xl font-semibold">{indicators.totalStaff}</p><p className="mt-1 text-[0.6875rem] text-muted">Staff</p></div>
        <div className="px-3 py-4 text-center"><p className="text-xl font-semibold text-success">{indicators.availableStaff}</p><p className="mt-1 text-[0.6875rem] text-muted">Disponibles</p></div>
        <div className="px-3 py-4 text-center"><p className="text-xl font-semibold text-warning">{indicators.activeAlerts}</p><p className="mt-1 text-[0.6875rem] text-muted">Alertas</p></div>
      </section>

      <SmartCard
        className="border-brand/25"
        icon={<Sparkles aria-hidden="true" className="size-5 text-brand" />}
        primaryValue={recommendation.title}
        secondaryValue={recommendation.reason}
        status={<StatusBadge label="Una recomendación" variant={recommendation.priority === "CRITICAL" ? "danger" : recommendation.priority === "WARNING" ? "warning" : "info"} />}
        title="ORBIT NOVA"
      />

      <section aria-labelledby="today-staff" className="space-y-5">
        <div id="today-staff"><SectionTitle description="Hora de llamado, transporte y recursos asignados a la jornada." title="Operaciones de hoy" /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {snapshot.members.filter(({ today }) => today).map(({ profile, today }) => today && (
            <SmartCard icon={<Clock3 aria-hidden="true" className="size-5" />} key={profile.id} primaryValue={`${today.callTime} · ${profile.firstName} ${profile.lastName}`} secondaryValue={today.eventName} status={<StatusBadge label={RESPONSE_STATUS[responses[profile.id] ?? today.responseStatus].label} variant={RESPONSE_STATUS[responses[profile.id] ?? today.responseStatus].variant} />} title="Hora de llamado">
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <Definition label="Vehículo" value={today.vehicle} /><Definition label="Black Box" value={today.blackBox} /><Definition label="Cabina" value={today.booth} /><Definition label="Salida" value={today.departureTime} />
              </dl>
            </SmartCard>
          ))}
        </div>
      </section>

      <section aria-labelledby="staff-workflow" className="space-y-5">
        <div id="staff-workflow"><SectionTitle description="Aceptar una invitación no confirma la asignación. BOOMBOX mantiene la decisión final." title="Flujo de asignación" /></div>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {["Planificador", "Notificación al equipo", "Aceptación del colaborador", "Aprobación BOOMBOX", "Asignación confirmada"].map((step, index) => (
            <li className="rounded-xl border bg-card p-4" key={step}><span className="text-xs font-semibold text-brand">PASO {index + 1}</span><p className="mt-2 text-sm font-semibold">{step}</p></li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="staff-roster" className="space-y-5">
        <div id="staff-roster"><SectionTitle description="Información operacional y laboral preparada para cada colaborador." title="Perfiles del equipo" /></div>
        <SearchBar aria-label="Buscar Staff" clearLabel="Limpiar búsqueda" onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Buscar por nombre, rol o disponibilidad..." value={query} />
        <div className="space-y-6">
          {visibleMembers.map((member) => <StaffMemberCard key={member.profile.id} member={member} onRespond={handleResponse} response={responses[member.profile.id]} />)}
          {!visibleMembers.length && <SmartCard primaryValue="No encontramos colaboradores" secondaryValue="Prueba con otro nombre, rol o estado de disponibilidad para continuar." status={<DataStateBadge state="PENDING" />} title="Revisa tu búsqueda" />}
        </div>
      </section>

      <StaffImport />
      <LiveExpenseCapture onClose={()=>setExpenseOpen(false)} open={expenseOpen}/>

      <p aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}

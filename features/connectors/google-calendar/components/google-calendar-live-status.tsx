"use client";

import { CalendarCheck2, CalendarClock, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { BrandLogo } from "@/components/brand-logo";
import { SectionTitle } from "@/components/layout/section-title";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataStateBadge } from "@/components/ui/data-state-badge";
import { MOCK_APPROVED_CALENDAR_EVENT, MOCK_GOOGLE_CALENDAR_SYNC_RECORD } from "../application/mock-google-calendar-live";
import type { GoogleCalendarSyncStatus } from "../types/google-calendar-live.types";

const STATUS_PRESENTATION: Record<GoogleCalendarSyncStatus, { label: string; variant: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  PENDING: { label: "Pendiente", variant: "neutral" },
  SYNCHRONIZED: { label: "Sincronizado", variant: "success" },
  UPDATE_REQUIRED: { label: "Actualización requerida", variant: "warning" },
  ERROR: { label: "Error", variant: "danger" },
  CANCELLED: { label: "Cancelado", variant: "neutral" },
};

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-sm font-semibold leading-5">{value}</dd></div>;
}

export function GoogleCalendarLiveStatus() {
  const [status, setStatus] = useState<GoogleCalendarSyncStatus>(MOCK_GOOGLE_CALENDAR_SYNC_RECORD.status);
  const [announcement, setAnnouncement] = useState("");
  const presentation = STATUS_PRESENTATION[status];

  function updateStatus(nextStatus: GoogleCalendarSyncStatus, message: string) {
    setStatus(nextStatus);
    setAnnouncement(message);
  }

  return (
    <section aria-labelledby="google-calendar-live" className="space-y-6 border-t pt-10 lg:pt-12">
      <div id="google-calendar-live">
        <BrandLogo className="mb-3 h-14 w-40" surface="dark" />
        <div className="flex flex-wrap items-center gap-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">GOOGLE WORKSPACE · CALENDAR</p><DataStateBadge state="DEMO" /></div>
        <SectionTitle description="Vista de preparación sin conexión externa. ORBIT continúa siendo la única fuente de verdad." title="Google Calendar" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <SmartCard
          icon={<CalendarCheck2 aria-hidden="true" className="size-5" />}
          primaryValue={MOCK_APPROVED_CALENDAR_EVENT.customerName}
          secondaryValue={`${MOCK_APPROVED_CALENDAR_EVENT.eventType === "WEDDING" ? "Matrimonio" : MOCK_APPROVED_CALENDAR_EVENT.eventType} · ${MOCK_APPROVED_CALENDAR_EVENT.service} · ${MOCK_APPROVED_CALENDAR_EVENT.contractedHours} horas`}
          status={<DataStateBadge label={`${presentation.label} · simulado`} state="MOCK" />}
          title={MOCK_GOOGLE_CALENDAR_SYNC_RECORD.orbitEventId}
        >
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Detail label="Fecha" value={MOCK_APPROVED_CALENDAR_EVENT.eventDate} />
            <Detail label="Servicio · Duración" value={`${MOCK_APPROVED_CALENDAR_EVENT.service} · ${MOCK_APPROVED_CALENDAR_EVENT.contractedHours} horas`} />
            <Detail label="Hora de llamado" value={MOCK_APPROVED_CALENDAR_EVENT.operatorCallTime} />
            <Detail label="Operador" value={MOCK_APPROVED_CALENDAR_EVENT.operator} />
            <Detail label="Vehículo" value={MOCK_APPROVED_CALENDAR_EVENT.assignedVehicle} />
            <Detail label="Black Box · Cabina" value={`${MOCK_APPROVED_CALENDAR_EVENT.blackBox} · ${MOCK_APPROVED_CALENDAR_EVENT.booth}`} />
            <Detail label="Montaje" value={MOCK_APPROVED_CALENDAR_EVENT.mountingWindow} />
            <Detail label="Inicio · Fin" value={`${MOCK_APPROVED_CALENDAR_EVENT.serviceStart} · ${MOCK_APPROVED_CALENDAR_EVENT.serviceEnd}`} />
            <Detail label="Desmontaje" value={MOCK_APPROVED_CALENDAR_EVENT.dismantlingWindow} />
            <Detail label="Última sincronización" value={MOCK_GOOGLE_CALENDAR_SYNC_RECORD.lastSynchronization ?? "Pendiente"} />
            <Detail label="Contacto del evento" value={`${MOCK_APPROVED_CALENDAR_EVENT.customerPhone} · ${MOCK_APPROVED_CALENDAR_EVENT.customerEmail}`} />
            <Detail label="Extras" value={MOCK_APPROVED_CALENDAR_EVENT.extras.join(", ")} />
            <Detail label="Pago del operador" value={MOCK_APPROVED_CALENDAR_EVENT.includeOperatorPaymentStatus ? MOCK_APPROVED_CALENDAR_EVENT.operatorPaymentStatus === "CONFIRMED" ? "Confirmado" : MOCK_APPROVED_CALENDAR_EVENT.operatorPaymentStatus === "NOT_APPLICABLE" ? "No aplica" : "Pendiente" : "Oculto"} />
            <div className="sm:col-span-2 xl:col-span-3"><Detail label="Dirección" value={MOCK_APPROVED_CALENDAR_EVENT.customerAddress} /></div>
            <div className="sm:col-span-2 xl:col-span-3"><Detail label="Notas operacionales" value={MOCK_APPROVED_CALENDAR_EVENT.operationalNotes} /></div>
          </dl>

          <div className="mt-5 flex flex-col gap-2 border-t pt-5 sm:flex-row sm:flex-wrap">
            {status !== "CANCELLED" ? (
              <>
                <ActionButton icon={RefreshCw} label="Actualizar evento" onClick={() => updateStatus("SYNCHRONIZED", "Evento actualizado sin crear duplicados.")} type="button" />
                <ActionButton icon={Trash2} label="Cancelar evento" onClick={() => updateStatus("CANCELLED", "Evento cancelado en el espejo operacional.")} type="button" variant="outline" />
              </>
            ) : (
              <ActionButton icon={RotateCcw} label="Restaurar evento" onClick={() => updateStatus("SYNCHRONIZED", "Evento restaurado con el mismo ORBIT Event ID.")} type="button" />
            )}
          </div>
        </SmartCard>

        <SmartCard icon={<CalendarClock aria-hidden="true" className="size-5" />} primaryValue="Plan aprobado" secondaryValue="Los borradores nunca llegan a Google Calendar." status={<StatusBadge label="Regla activa" variant="info" />} title="Flujo de sincronización">
          <ol className="space-y-3 text-sm">
            {["Plan Diario aprobado por BOOMBOX", "Validar Google Workspace", "Buscar ORBIT Event ID", "Crear o actualizar el mismo evento", "Guardar estado de sincronización"].map((step, index) => (
              <li className="flex items-start gap-3" key={step}><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold">{index + 1}</span><span className="pt-0.5 font-medium">{step}</span></li>
            ))}
          </ol>
          <div className="mt-5 border-t pt-5"><Detail label="Google Event ID" value={MOCK_GOOGLE_CALENDAR_SYNC_RECORD.googleEventId ?? "Pendiente"} /><div className="mt-4"><Detail label="Abrir ORBIT" value={MOCK_APPROVED_CALENDAR_EVENT.orbitProjectUrl} /></div><div className="mt-4"><Detail label="Google Maps" value={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MOCK_APPROVED_CALENDAR_EVENT.customerAddress)}`} /></div></div>
        </SmartCard>
      </div>
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  );
}

import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  Clock3,
  Route,
  ShieldAlert,
  Truck,
  UserRound,
} from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { SectionTitle } from "@/components/layout/section-title";
import { StatusBadge } from "@/components/ui/status-badge";
import { getEventType, getService } from "@/features/business-core";
import type {
  DailyOperationalPlan,
  OperationalAlertType,
  OperationalRouteDirection,
  OperationalSequenceType,
} from "../types";

const ROUTE_LABEL: Record<OperationalRouteDirection, string> = {
  NORTH: "Norte",
  SOUTH: "Sur",
  EAST: "Oriente",
  WEST: "Poniente",
};

const SEQUENCE_LABEL: Record<OperationalSequenceType, string> = {
  MOUNTING: "Montaje",
  SERVICE: "Servicio",
  DISMANTLING: "Desmontaje",
};

const ALERT_LABEL: Record<OperationalAlertType, string> = {
  OPERATOR_CONFLICT: "Conflicto de operador",
  VEHICLE_CONFLICT: "Conflicto de vehículo",
  BLACK_BOX_CONFLICT: "Conflicto de Black Box",
  BOOTH_CONFLICT: "Conflicto de cabina",
  OPERATIONAL_RISK: "Riesgo operacional",
};

export interface DailyOperationsPlanProps {
  plan: DailyOperationalPlan;
}

export function DailyOperationsPlan({ plan }: DailyOperationsPlanProps) {
  return (
    <section aria-labelledby="plan-operacional-diario" className="space-y-5">
      <div id="plan-operacional-diario">
        <SectionTitle
          description="Propuesta generada por ORBIT. BOOMBOX mantiene la decisión y aprobación final."
          title="Plan operacional diario"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SmartCard icon={<Route aria-hidden="true" className="size-5" />} primaryValue={`${plan.routes.length}`} secondaryValue="Solo se crean las rutas necesarias" status={<StatusBadge label="Borrador" variant="info" />} title="Rutas propuestas" />
        <SmartCard icon={<AlertTriangle aria-hidden="true" className="size-5" />} primaryValue={`${plan.alerts.length}`} secondaryValue="Requieren revisión antes de aprobar" status={<StatusBadge label={plan.alerts.length ? "Atención" : "Sin alertas"} variant={plan.alerts.length ? "warning" : "success"} />} title="Alertas operacionales" />
        <SmartCard icon={<ShieldAlert aria-hidden="true" className="size-5" />} primaryValue="Pendiente" secondaryValue="Decisión final de BOOMBOX · Ninguna asignación ejecutada" status={<StatusBadge label="Solo propuesta" variant="neutral" />} title="Aprobación final" />
      </div>

      {plan.recommendations.length > 0 && (
        <div className="rounded-2xl border border-brand/20 bg-brand/5 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Recomendación del plan</p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight">{plan.recommendations[0].title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{plan.recommendations[0].reason}</p>
        </div>
      )}

      {plan.alerts.length > 0 && (
        <div aria-label="Alertas del plan" className="grid gap-3 sm:grid-cols-2">
          {plan.alerts.map((alert) => (
            <div className="flex gap-3 rounded-xl border border-warning/15 bg-warning-soft/35 p-4" key={alert.id}>
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-semibold">{ALERT_LABEL[alert.type]}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {plan.routes.map((route, index) => (
          <details className="group rounded-2xl border bg-card" key={route.id} open={index === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 sm:p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">Ruta {ROUTE_LABEL[route.direction]}</h3>
                  <StatusBadge label="Propuesta" variant="info" />
                </div>
                <p className="mt-2 text-sm text-muted">Salida {formatOperationalTime(route.departureTime)} · Regreso estimado {formatOperationalTime(route.estimatedReturnTime)}</p>
              </div>
              <ChevronDown aria-hidden="true" className="size-5 shrink-0 transition-transform group-open:rotate-180" />
            </summary>

            <div className="space-y-6 border-t p-5 sm:p-6">
              <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <RouteDetail icon={<Truck aria-hidden="true" className="size-4" />} label="Vehículo propuesto" value={route.vehicle?.name ?? "Sin vehículo disponible"} />
                <RouteDetail icon={<UserRound aria-hidden="true" className="size-4" />} label="Operadores propuestos" value={route.operators.map((operator) => operator.name).join(" · ") || "Sin operador disponible"} />
                <RouteDetail icon={<Boxes aria-hidden="true" className="size-4" />} label="Black Boxes" value={route.blackBoxes.map((equipment) => equipment.name).join(" · ") || "Sin Black Box disponible"} />
                <RouteDetail icon={<Boxes aria-hidden="true" className="size-4" />} label="Cabinas" value={route.booths.map((equipment) => equipment.name).join(" · ") || "Sin cabina disponible"} />
              </dl>

              <div>
                <h4 className="text-sm font-semibold">Eventos de la ruta</h4>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {route.events.map((event) => (
                    <article className="rounded-xl border border-border/70 bg-accent/35 p-4" key={event.project.operationalEvent.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h5 className="font-semibold">{event.project.customer}</h5>
                          <p className="mt-1 text-sm text-muted">{getEventType(event.project.eventType).name} · {getService(event.project.service).name} • {event.project.operationalEvent.contractedHours} horas</p>
                        </div>
                        <StatusBadge label={event.project.commune} variant="neutral" />
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <CompactDetail label="Servicio" value={`${event.project.operationalEvent.serviceStartTime}–${formatOperationalTime(event.serviceEndTime)}`} />
                        <CompactDetail label="Llamada operador" value={formatOperationalTime(event.operatorCallTime)} />
                        <CompactDetail label="Montaje" value={`${event.mountingWindowMinutes} minutos`} />
                        <CompactDetail label="Desmontaje" value={`${event.dismantlingWindowMinutes} minutos`} />
                      </dl>
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold">Secuencia operacional</h4>
                <ol className="mt-3 space-y-2">
                  {route.sequence.map((item) => (
                    <li className="grid gap-2 rounded-lg bg-accent/45 px-3 py-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]" key={item.id}>
                      <span className="flex items-center gap-2 font-medium text-brand"><Clock3 aria-hidden="true" className="size-4" />{formatOperationalTime(item.start)}</span>
                      <span><strong>{SEQUENCE_LABEL[item.type]}</strong> · {item.title.replace(`${SEQUENCE_LABEL[item.type]} · `, "")} · {item.location}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function RouteDetail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl bg-accent/45 p-4"><dt className="flex items-center gap-2 text-muted">{icon}{label}</dt><dd className="mt-2 font-semibold leading-6">{value}</dd></div>;
}

function CompactDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>;
}

function formatOperationalTime(time: { time: string; dayOffset: number }): string {
  return `${time.time}${time.dayOffset > 0 ? " (+1)" : time.dayOffset < 0 ? " (-1)" : ""}`;
}

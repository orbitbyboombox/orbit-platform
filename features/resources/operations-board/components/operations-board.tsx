import {
  Activity,
  AlertTriangle,
  Boxes,
  Gauge,
  Sparkles,
  Truck,
  UserRound,
  Warehouse,
} from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { SectionTitle } from "@/components/layout/section-title";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  MaintenanceStatus,
  OperationalAlertSeverity,
  OperationsBoardSnapshot,
  ResourceStatus,
} from "../types/operations-board.types";

const RESOURCE_STATUS: Record<ResourceStatus, { label: string; variant: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  AVAILABLE: { label: "Disponible", variant: "success" },
  RESERVED: { label: "Reservado", variant: "info" },
  IN_USE: { label: "En operación", variant: "warning" },
  MAINTENANCE: { label: "Mantenimiento", variant: "danger" },
  UNAVAILABLE: { label: "No disponible", variant: "danger" },
};

const MAINTENANCE_STATUS: Record<MaintenanceStatus, { label: string; variant: "success" | "warning" | "danger" }> = {
  HEALTHY: { label: "Al día", variant: "success" },
  UPCOMING: { label: "Próximo", variant: "warning" },
  OVERDUE: { label: "Vencido", variant: "danger" },
};

const ALERT_VARIANT: Record<OperationalAlertSeverity, "info" | "warning" | "danger"> = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "danger",
};

interface ResourceRowProps {
  title: string;
  subtitle: string;
  status: ResourceStatus;
  details: readonly { label: string; value: string }[];
  maintenanceStatus?: MaintenanceStatus;
}

function ResourceRow({ details, maintenanceStatus, status, subtitle, title }: ResourceRowProps) {
  const resourceStatus = RESOURCE_STATUS[status];
  const maintenance = maintenanceStatus ? MAINTENANCE_STATUS[maintenanceStatus] : undefined;

  return (
    <li className="rounded-xl border border-border/70 bg-accent/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold tracking-tight">{title}</p>
          <p className="mt-1 text-xs text-muted">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={resourceStatus.label} variant={resourceStatus.variant} />
          {maintenance && <StatusBadge label={maintenance.label} variant={maintenance.variant} />}
        </div>
      </div>
      <dl className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
        {details.map((detail) => (
          <div key={detail.label}>
            <dt className="text-xs text-muted">{detail.label}</dt>
            <dd className="mt-1 text-sm font-medium">{detail.value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

interface OperationsBoardProps {
  snapshot: OperationsBoardSnapshot;
}

export function OperationsBoard({ snapshot }: OperationsBoardProps) {
  const { dailyCapacity, health, recommendation } = snapshot;

  return (
    <div className="space-y-10 lg:space-y-12">
      <header className="rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
        <p className="text-sm font-medium text-brand">OPERACIONES</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Tablero de Operaciones</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          Salud, disponibilidad y utilización de todos los recursos operacionales en una sola vista.
        </p>
      </header>

      <SmartCard
        className="border-brand/25"
        icon={<Sparkles aria-hidden="true" className="size-5 text-brand" />}
        primaryValue={recommendation.title}
        secondaryValue={recommendation.reason}
        status={<StatusBadge label="Una recomendación" variant={ALERT_VARIANT[recommendation.priority]} />}
        title="ORBIT NOVA"
      />

      <section aria-labelledby="black-boxes" className="space-y-5">
        <div id="black-boxes"><SectionTitle description="Disponibilidad, uso y mantenimiento del inventario principal." title="Black Boxes" /></div>
        <SmartCard icon={<Boxes aria-hidden="true" className="size-5" />} title="Inventario Black Box">
          <ul className="grid gap-3 lg:grid-cols-2">
            {snapshot.blackBoxes.map((box) => (
              <ResourceRow
                details={[
                  { label: "Evento actual", value: box.currentEvent ?? "Sin evento" },
                  { label: "Próximo evento", value: box.nextEvent ?? "Sin asignación" },
                ]}
                key={box.id}
                maintenanceStatus={box.maintenanceStatus}
                status={box.status}
                subtitle="Activo operacional"
                title={box.number}
              />
            ))}
            {!snapshot.blackBoxes.length && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">Aún no hay Black Boxes registradas en asignaciones. Cuando se asigne una, aparecerá aquí.</li>}
          </ul>
        </SmartCard>
      </section>

      <section aria-labelledby="booths" className="space-y-5">
        <div id="booths"><SectionTitle description="Asignación entre cabinas y Black Boxes para la jornada." title="Cabinas" /></div>
        <SmartCard icon={<Warehouse aria-hidden="true" className="size-5" />} title="Inventario de cabinas">
          <ul className="grid gap-3 lg:grid-cols-2">
            {snapshot.booths.map((booth) => (
              <ResourceRow
                details={[
                  { label: "Black Box asignada", value: booth.assignedBox ?? "Sin asignar" },
                  { label: "Evento actual", value: booth.currentEvent ?? "Sin evento" },
                ]}
                key={booth.id}
                maintenanceStatus={booth.maintenanceStatus}
                status={booth.status}
                subtitle="Unidad de servicio"
                title={booth.number}
              />
            ))}
            {!snapshot.booths.length && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">Aún no hay cabinas registradas en asignaciones. Cuando se asigne una, aparecerá aquí.</li>}
          </ul>
        </SmartCard>
      </section>

      <section aria-labelledby="vehicles" className="space-y-5">
        <div id="vehicles"><SectionTitle description="Estado de ruta, kilometraje y mantenimiento preventivo." title="Vehículos" /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {snapshot.vehicles.map((vehicle) => (
            <SmartCard
              icon={<Truck aria-hidden="true" className="size-5" />}
              key={vehicle.id}
              primaryValue={`${vehicle.currentKm.toLocaleString("es-CL")} km`}
              secondaryValue={`${vehicle.remainingMaintenanceKm.toLocaleString("es-CL")} km hasta mantenimiento`}
              status={<StatusBadge label={RESOURCE_STATUS[vehicle.status].label} variant={RESOURCE_STATUS[vehicle.status].variant} />}
              title={vehicle.name}
            >
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Patente</dt><dd className="mt-1 font-semibold">{vehicle.plate}</dd></div>
                <div><dt className="text-muted">Ruta actual</dt><dd className="mt-1 font-semibold">{vehicle.currentRoute ?? "Sin ruta"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted">Mantenimiento</dt><dd className="mt-2"><StatusBadge label={MAINTENANCE_STATUS[vehicle.maintenanceStatus].label} variant={MAINTENANCE_STATUS[vehicle.maintenanceStatus].variant} /></dd></div>
              </dl>
            </SmartCard>
          ))}
          {!snapshot.vehicles.length && <SmartCard icon={<Truck aria-hidden="true" className="size-5" />} primaryValue="Sin vehículos registrados" secondaryValue="Los vehículos aparecerán cuando formen parte de una asignación operacional." title="Flota" />}
        </div>
      </section>

      <section aria-labelledby="operators" className="space-y-5">
        <div id="operators"><SectionTitle description="Asignación y disponibilidad del equipo para los eventos de hoy." title="Operadores" /></div>
        <SmartCard icon={<UserRound aria-hidden="true" className="size-5" />} title="Equipo operacional">
          <ul className="grid gap-3 lg:grid-cols-2">
            {snapshot.operators.map((operator) => (
              <ResourceRow
                details={[
                  { label: "Asignación actual", value: operator.currentAssignment ?? "Sin asignación" },
                  { label: "Eventos de hoy", value: operator.todayEvents.toString() },
                ]}
                key={operator.id}
                status={operator.status}
                subtitle={operator.availability}
                title={operator.name}
              />
            ))}
            {!snapshot.operators.length && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">Aún no hay operadores activos. Crea un perfil de Staff para comenzar.</li>}
          </ul>
        </SmartCard>
      </section>

      <section aria-labelledby="daily-capacity" className="space-y-5">
        <div id="daily-capacity"><SectionTitle description="Capacidad disponible, salud del inventario y alertas que requieren atención." title="Capacidad diaria" /></div>
        <div className="grid gap-4 xl:grid-cols-3">
          <SmartCard icon={<Gauge aria-hidden="true" className="size-5" />} primaryValue={`${dailyCapacity.operationalCapacityPercentage}%`} secondaryValue="Utilización del próximo sábado" title="Capacidad operacional">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-muted">Boxes</dt><dd className="mt-1 font-semibold">{dailyCapacity.boxes.available} disponibles · {dailyCapacity.boxes.reserved} reservados · {dailyCapacity.boxes.maintenance} en mantención</dd></div>
              <div><dt className="text-muted">Cabinas</dt><dd className="mt-1 font-semibold">{dailyCapacity.booths.available} disponibles · {dailyCapacity.booths.reserved} reservadas · {dailyCapacity.booths.maintenance} en mantención</dd></div>
              <div><dt className="text-muted">Vehículos disponibles</dt><dd className="mt-1 text-xl font-semibold">{dailyCapacity.availableVehicles}</dd></div>
              <div><dt className="text-muted">Operadores disponibles</dt><dd className="mt-1 text-xl font-semibold">{dailyCapacity.availableOperators}</dd></div>
              <div className="col-span-2"><dt className="text-muted">Eventos adicionales posibles</dt><dd className="mt-1 text-2xl font-semibold text-brand">{dailyCapacity.potentialAdditionalEvents}</dd></div>
            </dl>
          </SmartCard>

          <SmartCard icon={<Activity aria-hidden="true" className="size-5" />} title="Indicadores de capacidad">
            <div className="space-y-5">
              {snapshot.capacityIndicators.map((indicator) => (
                <div key={indicator.id}>
                  <div className="flex items-center justify-between gap-4 text-sm"><span className="font-medium">{indicator.label}</span><span className="font-semibold">{indicator.percentage}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent"><div className="h-full rounded-full bg-brand" style={{ width: `${indicator.percentage}%` }} /></div>
                </div>
              ))}
            </div>
          </SmartCard>

          <SmartCard icon={<AlertTriangle aria-hidden="true" className="size-5" />} title="Salud operacional">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-muted">Activos saludables</dt><dd className="mt-1 text-2xl font-semibold">{health.healthyAssets}</dd></div>
              <div><dt className="text-muted">Mantención próxima</dt><dd className="mt-1 text-2xl font-semibold">{health.upcomingMaintenance}</dd></div>
              <div><dt className="text-muted">Mantención vencida</dt><dd className="mt-1 text-2xl font-semibold">{health.overdueMaintenance}</dd></div>
              <div><dt className="text-muted">Alertas vehiculares</dt><dd className="mt-1 text-2xl font-semibold">{health.vehicleAlerts}</dd></div>
            </dl>
          </SmartCard>
        </div>

        <SmartCard icon={<AlertTriangle aria-hidden="true" className="size-5" />} title="Alertas operacionales">
          <ul className="grid gap-3 sm:grid-cols-2">
            {snapshot.alerts.map((alert) => (
              <li className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-accent/25 p-4" key={alert.id}>
                <p className="text-sm leading-6">{alert.message}</p>
                <StatusBadge label={alert.severity === "CRITICAL" ? "Crítica" : alert.severity === "WARNING" ? "Atención" : "Información"} variant={ALERT_VARIANT[alert.severity]} />
              </li>
            ))}
          </ul>
        </SmartCard>
      </section>
    </div>
  );
}

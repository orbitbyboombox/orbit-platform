"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Ban,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  ExternalLink,
  EyeOff,
  FileText,
  FolderOpen,
  Gauge,
  History,
  Link2,
  ListChecks,
  Package,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ProjectHeaderProps } from "@/components/project/project-header";
import { createCustomerPortalAccessAction } from "@/features/customer-portal/admin.actions";
import { ORBIT_TIME_ENGINE } from "@/features/time-intelligence";
import {
  EquipmentAssignmentPanel,
  type EquipmentAssignmentPanelProps,
} from "@/features/asset-management";
import { AgreementSigningControl } from "@/features/projects/signing/agreement-signing-control";
import {
  ProductionIntegrationPanel,
  type ProductionIntegrationPanelProps,
  type ReadinessState,
} from "./production-integration-panel";
import { updateOperationalTaskStatusAction } from "@/features/task-center/actions";
import type { TaskPriority, TaskStatus } from "@/features/task-center/types";
import type { CustomerPortalStage } from "./customer-portal-experience";
import {
  ExperienceReviewEngine,
  type ExistingExperienceReview,
  type ExperienceKnowledgeItem,
} from "@/features/experience-review";
import {
  EventOperationsChecklist,
  type EventOperationsChecklistData,
} from "@/features/event-operations-checklist";
import {
  transitionReservationLifecycleAction,
  type ReservationLifecycleAction,
} from "@/features/projects/actions/reservation-lifecycle.actions";
import {
  StaffAssignmentCenter,
  type StaffAssignmentCenterProps,
} from "@/features/staff-assignment-center";
import type { RealEventCostSummary } from "@/features/profit-engine";
import {
  RealCostOverridePanel,
  type RealCostData,
} from "./real-cost-override-panel";
import {
  EventProfitabilityPanel,
  type EventProfitabilityData,
} from "./event-profitability-panel";
import { saveFounderWorkspaceAction } from "@/features/founder-workspace/actions";
import type {
  EventModuleKey,
  FounderWorkspacePreferences,
} from "@/features/founder-workspace/catalog";

type Event360Task = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
  version: number;
  assignedUser?: string | null;
};
type Event360Data = {
  orbitEventId: string;
  status: string;
  customer: {
    phone: string;
    email: string;
    address: string;
    city: string;
    emergencyContact: string;
  };
  services: readonly {
    code: string;
    duration: string;
    extras: readonly string[];
  }[];
  tasks: readonly Event360Task[];
  timeline: readonly {
    id: string;
    message: string;
    actor: string;
    source: string;
    occurredAt: string;
  }[];
  documents: readonly {
    id: string;
    type: string;
    href?: string;
    createdAt: string;
  }[];
  google: {
    calendarStatus: string;
    calendarUrl?: string;
    driveStatus: string;
    driveUrl?: string;
    driveLastSyncedAt?: string;
    gmailStatus: string;
    gmailThread?: string;
  };
  payroll: readonly {
    staff: string;
    assembly: number;
    operator: number;
    disassembly: number;
    transport: number;
    parking: number;
    total: number;
    status: string;
  }[];
  profit?: RealEventCostSummary;
  estimatedCosts?: {
    status: string;
    paper: number;
    operator: number;
    assembly: number;
    disassembly: number;
    fuel: number;
    transport: number;
    scrapbook: number;
    magnets: number;
    pens: number;
    doubleSidedTape: number;
    other: number;
    total: number;
    calculatedAt: string;
  };
  realCosts?: RealCostData;
  profitability?: EventProfitabilityData;
  receivable?: {
    invoiceNumber: string;
    amount: number;
    outstandingBalance: number;
    dueDate: string | null;
    paymentTerm: string;
    daysRemaining: number | null;
    status: string;
  };
  checklist: EventOperationsChecklistData;
  experienceReview: {
    existing?: ExistingExperienceReview;
    knowledge: readonly ExperienceKnowledgeItem[];
  };
  staffAssignments: StaffAssignmentCenterProps;
};

export type ProjectWorkspaceExperienceProps = Omit<
  ProjectHeaderProps,
  "status"
> & {
  projectKey?: string;
  portalStage?: CustomerPortalStage;
  eventDateIso?: string;
  activities?: readonly { title: string; detail: string; time: string }[];
  equipment: EquipmentAssignmentPanelProps;
  signing: { agreementId?: string; status: string };
  productionIntegration: ProductionIntegrationPanelProps;
  event360: Event360Data;
  workspacePreferences: FounderWorkspacePreferences;
  workspaceData: {
    sale: string;
    balance: string;
    margin: string;
    deposit: string;
    contractStatus: string;
    contractDate: string;
    checklist: string;
    operator: string;
    booth: string;
    gallery: string;
    backup: string;
    communication: string;
    commercialStage: string;
    lastQuotation: string;
  };
};

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const statePresentation: Record<
  ReadinessState,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  READY: { label: "Listo", variant: "success" },
  ATTENTION: { label: "Atención", variant: "warning" },
  ACTION_REQUIRED: { label: "Falta información", variant: "danger" },
};

function Section({
  id,
  eyebrow,
  title,
  icon,
  children,
  className = "",
}: {
  id: string;
  eyebrow: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`scroll-mt-24 rounded-2xl border bg-card p-5 sm:p-6 ${className}`}
      id={id}
    >
      <header className="mb-5 flex items-start gap-3 border-b pb-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
          {icon}
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
        </div>
      </header>
      {children}
    </section>
  );
}
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-10 items-start justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function OptionalModule({
  moduleKey,
  onHide,
  children,
}: {
  moduleKey: EventModuleKey;
  onHide: (key: EventModuleKey) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <button
        className="mb-2 ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-muted transition hover:border-brand hover:text-foreground"
        onClick={() => onHide(moduleKey)}
        type="button"
      >
        <EyeOff className="size-3.5" />
        Ocultar de Mi Escritorio
      </button>
      {children}
    </div>
  );
}

function TaskRow({ task }: { task: Event360Task }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const complete = () =>
    startTransition(async () => {
      const result = await updateOperationalTaskStatusAction({
        id: task.id,
        status: task.status === "COMPLETED" ? "PENDING" : "COMPLETED",
        expectedVersion: task.version,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  const overdue = Boolean(
    task.due_at &&
      new Date(task.due_at) < new Date() &&
      task.status !== "COMPLETED",
  );
  return (
    <article className="rounded-xl border bg-background/30 p-4">
      <div className="flex items-start gap-3">
        <button
          aria-label={
            task.status === "COMPLETED" ? "Reabrir tarea" : "Completar tarea"
          }
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border transition hover:border-brand disabled:opacity-50"
          disabled={pending}
          onClick={complete}
        >
          {task.status === "COMPLETED" ? (
            <Check className="size-4 text-success" />
          ) : (
            <span className="size-4 rounded border" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`font-medium ${task.status === "COMPLETED" ? "text-muted line-through" : ""}`}
            >
              {task.title}
            </p>
            <StatusBadge
              label={overdue ? "Vencida" : task.priority}
              variant={
                overdue
                  ? "danger"
                  : task.priority === "CRITICAL"
                    ? "warning"
                    : "neutral"
              }
            />
          </div>
          {task.description && (
            <p className="mt-1 text-sm leading-6 text-muted">
              {task.description}
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            {task.due_at ? `Vence ${dateTime(task.due_at)}` : "Sin vencimiento"}
            {task.assignedUser ? ` · ${task.assignedUser}` : ""}
          </p>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      </div>
    </article>
  );
}

export function ProjectWorkspaceExperience(
  props: ProjectWorkspaceExperienceProps,
) {
  const router = useRouter();
  const [portalUrl, setPortalUrl] = useState("");
  const [portalFeedback, setPortalFeedback] = useState("");
  const [customerDeleteFeedback, setCustomerDeleteFeedback] = useState("");
  const [workspacePreferences, setWorkspacePreferences] = useState(
    props.workspacePreferences,
  );
  const [, startWorkspaceTransition] = useTransition();
  const event = props.event360;
  const intelligence = ORBIT_TIME_ENGINE.getEventIntelligence({
    eventDate: props.eventDateIso ?? "",
  });
  const readiness = props.productionIntegration.readiness;
  const missing = readiness.filter((x) => x.state === "ACTION_REQUIRED").length;
  const attention = readiness.filter((x) => x.state === "ATTENTION").length;
  const overdueTasks = event.tasks.filter(
    (x) =>
      x.due_at &&
      new Date(x.due_at) < new Date() &&
      !["COMPLETED", "CANCELLED"].includes(x.status),
  ).length;
  const checklistPenalty = Math.round((100 - event.checklist.progress) * 0.25);
  const health = Math.max(
    0,
    100 - missing * 12 - attention * 5 - overdueTasks * 5 - checklistPenalty,
  );
  const healthLabel =
    health >= 90 ? "READY" : health >= 60 ? "ATTENTION" : "BLOCKED";
  const healthVariant =
    health >= 90 ? "success" : health >= 60 ? "warning" : "danger";
  const currentAssets = props.equipment.assets.filter(
    (a) => a.current?.projectName === "Este evento",
  );
  const totem = currentAssets.find((a) => a.type === "TOTEM");
  const assetCase = currentAssets.find((a) => a.type === "CASE");
  const operator = props.equipment.currentStaff.find(
    (a) => a.task === "OPERATOR",
  );
  const assembly = props.equipment.currentStaff.find(
    (a) => a.task === "ASSEMBLY",
  );
  const disassembly = props.equipment.currentStaff.find(
    (a) => a.task === "DISASSEMBLY",
  );
  const generatePortal = async () => {
    if (!props.projectKey) return;
    setPortalFeedback("Generando…");
    const result = await createCustomerPortalAccessAction(props.projectKey);
    if (result.ok) {
      setPortalUrl(result.url);
      setPortalFeedback("Portal disponible");
    } else setPortalFeedback(result.error);
  };
  const lifecycle = async (action: ReservationLifecycleAction) => {
    if (!props.projectKey) return;
    const labels = {
      ARCHIVE: "archivar",
      RESTORE: "restaurar",
      CANCEL: "cancelar",
      PERMANENT_DELETE: "eliminar permanentemente",
    };
    if (
      !window.confirm(
        `¿Confirmas ${labels[action]} la reserva de ${props.clientName}?${action === "PERMANENT_DELETE" ? " Esta acción elimina sus registros relacionados y no se puede deshacer. La carpeta de Drive se conservará archivada." : ""}`,
      )
    )
      return;
    if (
      action === "PERMANENT_DELETE" &&
      !window.confirm(
        "Confirmación final: el proyecto, factura, saldos, Portal y Timeline serán eliminados permanentemente.",
      )
    )
      return;
    const reason = window.prompt("Motivo obligatorio de la acción:")?.trim();
    if (!reason) return;
    setCustomerDeleteFeedback("Sincronizando ciclo de vida…");
    const result = await transitionReservationLifecycleAction(
      props.projectKey,
      action,
      reason,
    );
    if (result.ok) {
      window.alert(result.message);
      router.push("/projects");
      router.refresh();
    } else setCustomerDeleteFeedback(result.message);
  };
  const scroll = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  const moduleVisible = (key: EventModuleKey) =>
    !workspacePreferences.hiddenEventModules.includes(key);
  const hideModule = (key: EventModuleKey) => {
    const previous = workspacePreferences;
    const next = {
      ...previous,
      hiddenEventModules: Array.from(
        new Set([...previous.hiddenEventModules, key]),
      ),
    };
    setWorkspacePreferences(next);
    startWorkspaceTransition(async () => {
      const result = await saveFounderWorkspaceAction(next);
      if (!result.ok) {
        setWorkspacePreferences(previous);
        setCustomerDeleteFeedback(result.error);
      }
    });
  };
  const navigationItems = [
    {
      id: "customer",
      label: "Cliente",
      module: "GENERAL_INFORMATION" as EventModuleKey,
    },
    {
      id: "commercial",
      label: "Comercial",
      module: "COMMERCIAL_NEGOTIATION" as EventModuleKey,
    },
    {
      id: "operations",
      label: "Operaciones",
      module: "OPERATIONAL_CONTROL" as EventModuleKey,
    },
    {
      id: "staff-assignment",
      label: "Staff",
      module: "STAFF" as EventModuleKey,
    },
    {
      id: "estimated-costs",
      label: "Finanzas",
      module: "FINANCIAL_SUMMARY" as EventModuleKey,
    },
    { id: "tasks", label: "Tareas", module: "TASK_CENTER" as EventModuleKey },
    { id: "timeline", label: "Timeline", module: "TIMELINE" as EventModuleKey },
    {
      id: "documents",
      label: "Documentos",
      module: "DOCUMENTS" as EventModuleKey,
    },
    {
      id: "customer-portal",
      label: "Portal",
      module: "CUSTOMER_PORTAL" as EventModuleKey,
    },
    {
      id: "google-calendar",
      label: "Calendar",
      module: "GOOGLE_CALENDAR" as EventModuleKey,
    },
    {
      id: "post-event",
      label: "Cierre",
      module: "MILESTONES" as EventModuleKey,
    },
  ].filter((item) => moduleVisible(item.module));
  return (
    <WorkspaceLayout
      className="max-w-none p-0"
      header={null}
      timeline={null}
      copilot={null}
      mainContent={
        <div className="space-y-6 pb-8">
          <section className="overflow-hidden rounded-3xl border bg-card">
            <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={event.status} variant="info" />
                  <StatusBadge label={healthLabel} variant={healthVariant} />
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[.2em] text-brand">
                  Event 360° · {event.orbitEventId}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {props.projectName}
                </h1>
                <p className="mt-2 text-base text-muted">
                  {props.projectType} · {props.clientName}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[500px]">
                <HeroMetric label="Fecha" value={props.eventDate} />
                <HeroMetric
                  label="Cuenta regresiva"
                  value={intelligence.countdown.label}
                />
                <HeroMetric
                  label="Fase"
                  value={intelligence.timeline.phaseLabel}
                />
                <HeroMetric label="Salud" value={`${health}%`} />
              </div>
            </div>
            <nav
              aria-label="Secciones del evento"
              className="flex gap-2 overflow-x-auto border-t px-5 py-3 sm:px-7"
            >
              {navigationItems.map(({ id, label }) => (
                <button
                  className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-brand hover:text-foreground"
                  key={id}
                  onClick={() => scroll(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            {moduleVisible("GENERAL_INFORMATION") && (
              <Section
                eyebrow="01 · Relación"
                icon={<UserRound className="size-5" />}
                id="customer"
                title="Cliente"
              >
                <dl>
                  <Row label="Cliente" value={props.clientName} />
                  <Row
                    label="Teléfono"
                    value={event.customer.phone || "Sin registro"}
                  />
                  <Row
                    label="Email"
                    value={event.customer.email || "Sin registro"}
                  />
                  <Row label="Dirección" value={event.customer.address} />
                  <Row label="Lugar" value={props.location} />
                  <Row label="Comuna" value={event.customer.city} />
                  <Row
                    label="Google Maps"
                    value={
                      <a
                        className="text-brand hover:underline"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.location)}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Abrir ubicación
                      </a>
                    }
                  />
                  <Row
                    label="Contacto de emergencia"
                    value={event.customer.emergencyContact}
                  />
                </dl>
              </Section>
            )}
            {moduleVisible("COMMERCIAL_NEGOTIATION") && (
              <OptionalModule
                moduleKey="COMMERCIAL_NEGOTIATION"
                onHide={hideModule}
              >
                <Section
                  eyebrow="02 · Comercial"
                  icon={<BriefcaseBusiness className="size-5" />}
                  id="commercial"
                  title="Estado comercial"
                >
                  <dl>
                    <Row
                      label="Cotización"
                      value={props.workspaceData.lastQuotation}
                    />
                    <Row
                      label="Acuerdo"
                      value={props.workspaceData.contractStatus}
                    />
                    <Row
                      label="Precio negociado"
                      value={
                        props.productionIntegration.quotation
                          ? money(
                              props.productionIntegration.quotation
                                .finalCustomerPrice,
                            )
                          : "Sin cotización"
                      }
                    />
                    <Row
                      label="Factura"
                      value={
                        event.receivable?.invoiceNumber ?? "Sin factura emitida"
                      }
                    />
                    <Row
                      label="Monto facturado"
                      value={
                        event.receivable ? money(event.receivable.amount) : "—"
                      }
                    />
                    <Row
                      label="Saldo pendiente"
                      value={
                        event.receivable
                          ? money(event.receivable.outstandingBalance)
                          : props.workspaceData.balance
                      }
                    />
                    <Row
                      label="Vencimiento"
                      value={
                        event.receivable?.dueDate
                          ? new Intl.DateTimeFormat("es-CL", {
                              dateStyle: "medium",
                              timeZone: "UTC",
                            }).format(
                              new Date(`${event.receivable.dueDate}T12:00:00Z`),
                            )
                          : "Sin fecha"
                      }
                    />
                    <Row
                      label="Condición de pago"
                      value={event.receivable?.paymentTerm ?? "Sin registro"}
                    />
                    <Row
                      label="Días restantes"
                      value={
                        event.receivable?.daysRemaining === null ||
                        event.receivable?.daysRemaining === undefined
                          ? "—"
                          : event.receivable.daysRemaining < 0
                            ? `${Math.abs(event.receivable.daysRemaining)} días vencidos`
                            : `${event.receivable.daysRemaining} días`
                      }
                    />
                    <Row
                      label="Profit real"
                      value={
                        event.profit
                          ? `${money(event.profit.profit.grossProfit)} · ${event.profit.profit.grossMarginPercent.toFixed(1)}%`
                          : "Pendiente de cálculo"
                      }
                    />
                    <Row
                      label="Último movimiento"
                      value={
                        event.timeline.find((x) =>
                          ["Sales", "Administrator"].includes(x.source),
                        )?.message ?? "Sin actividad comercial"
                      }
                    />
                  </dl>
                </Section>
              </OptionalModule>
            )}
            {moduleVisible("GENERAL_INFORMATION") && (
              <Section
                eyebrow="03 · Experiencia"
                icon={<Sparkles className="size-5" />}
                id="service"
                title="Servicio contratado"
              >
                <div className="space-y-3">
                  {event.services.length ? (
                    event.services.map((service) => (
                      <article
                        className="rounded-xl border p-4"
                        key={service.code}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">{service.code}</p>
                          <StatusBadge
                            label={service.duration}
                            variant="info"
                          />
                        </div>
                        <p className="mt-3 text-sm text-muted">
                          {service.extras.length
                            ? service.extras.join(" · ")
                            : "Sin extras registrados"}
                        </p>
                      </article>
                    ))
                  ) : (
                    <Empty text="Cuando se agregue un servicio contratado, aparecerá aquí con su duración y extras." />
                  )}
                </div>
                <dl className="mt-4">
                  <Row label="Branding" value="Según cotización" />
                  <Row label="QR" value="Según servicio" />
                  <Row label="Imanes" value="Según extras" />
                  <Row label="Scrapbook" value="Según extras" />
                  <Row
                    label="Notas especiales"
                    value={props.workspaceData.checklist}
                  />
                </dl>
              </Section>
            )}
            {moduleVisible("OPERATIONAL_CONTROL") && (
              <OptionalModule
                moduleKey="OPERATIONAL_CONTROL"
                onHide={hideModule}
              >
                <Section
                  eyebrow="04 · Logística"
                  icon={<Package className="size-5" />}
                  id="operations"
                  title="Operación"
                >
                  <dl>
                    <Row
                      label="Tótem asignado"
                      value={totem?.code ?? "Sin asignar"}
                    />
                    <Row
                      label="Case asignado"
                      value={assetCase?.code ?? "Sin asignar"}
                    />
                    <Row
                      label="Vehículo"
                      value={
                        currentAssets.find((a) => a.type === "VEHICLE")?.code ??
                        "Sin asignar"
                      }
                    />
                    <Row
                      label="Operador"
                      value={operator?.name ?? "Sin asignar"}
                    />
                    <Row
                      label="Montaje"
                      value={assembly?.name ?? "Sin asignar"}
                    />
                    <Row
                      label="Desmontaje"
                      value={disassembly?.name ?? "Sin asignar"}
                    />
                    <Row
                      label="Notas operacionales"
                      value={props.workspaceData.checklist}
                    />
                  </dl>
                </Section>
              </OptionalModule>
            )}
          </section>

          {moduleVisible("FINANCIAL_SUMMARY") && (
            <Section
              eyebrow="05 · Costos automáticos"
              icon={<Gauge className="size-5" />}
              id="estimated-costs"
              title="Estimated Costs"
            >
              {event.estimatedCosts ? (
                <div className="space-y-4">
                  <dl>
                    <Row
                      label="Papel"
                      value={money(event.estimatedCosts.paper)}
                    />
                    <Row
                      label="Operador"
                      value={money(event.estimatedCosts.operator)}
                    />
                    <Row
                      label="Montaje"
                      value={money(event.estimatedCosts.assembly)}
                    />
                    <Row
                      label="Desmontaje"
                      value={money(event.estimatedCosts.disassembly)}
                    />
                    <Row
                      label="Combustible"
                      value={money(event.estimatedCosts.fuel)}
                    />
                    <Row
                      label="Transporte"
                      value={money(event.estimatedCosts.transport)}
                    />
                    <Row
                      label="Scrapbook"
                      value={money(event.estimatedCosts.scrapbook)}
                    />
                    <Row
                      label="Imanes"
                      value={money(event.estimatedCosts.magnets)}
                    />
                    <Row
                      label="Lápices"
                      value={money(event.estimatedCosts.pens)}
                    />
                    <Row
                      label="Cinta doble contacto"
                      value={money(event.estimatedCosts.doubleSidedTape)}
                    />
                    {event.estimatedCosts.other > 0 && (
                      <Row
                        label="Otros configurados"
                        value={money(event.estimatedCosts.other)}
                      />
                    )}
                    <Row
                      label="Costo total estimado"
                      value={money(event.estimatedCosts.total)}
                    />
                  </dl>
                  <p className="border-t pt-3 text-xs text-muted">
                    {event.estimatedCosts.status} · calculado automáticamente
                    desde Cost Master y Master Data ·{" "}
                    {dateTime(event.estimatedCosts.calculatedAt)}
                  </p>
                </div>
              ) : (
                <Empty text="La hoja se creará automáticamente cuando la reserva esté confirmada." />
              )}
            </Section>
          )}
          {moduleVisible("FINANCIAL_SUMMARY") && (
            <>
              {event.realCosts && (
                <RealCostOverridePanel
                  data={event.realCosts}
                  projectId={props.projectKey ?? ""}
                />
              )}{" "}
              {event.profitability && (
                <EventProfitabilityPanel data={event.profitability} />
              )}
            </>
          )}
          {moduleVisible("CHECKLIST") && (
            <OptionalModule moduleKey="CHECKLIST" onHide={hideModule}>
              <EventOperationsChecklist
                data={event.checklist}
                projectId={props.projectKey ?? ""}
              />
            </OptionalModule>
          )}
          {moduleVisible("STAFF") && (
            <StaffAssignmentCenter {...event.staffAssignments} />
          )}
          {moduleVisible("TASK_CENTER") && (
            <OptionalModule moduleKey="TASK_CENTER" onHide={hideModule}>
              <Section
                eyebrow="05 · Trabajo pendiente"
                icon={<ListChecks className="size-5" />}
                id="tasks"
                title="Task Center"
              >
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniMetric
                    label="Pendientes"
                    value={
                      event.tasks.filter((x) => x.status === "PENDING").length
                    }
                  />
                  <MiniMetric
                    label="Hoy"
                    value={
                      event.tasks.filter(
                        (x) =>
                          x.due_at &&
                          new Date(x.due_at).toDateString() ===
                            new Date().toDateString(),
                      ).length
                    }
                  />
                  <MiniMetric label="Vencidas" value={overdueTasks} />
                  <MiniMetric
                    label="Completadas"
                    value={
                      event.tasks.filter((x) => x.status === "COMPLETED").length
                    }
                  />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {event.tasks.length ? (
                    event.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))
                  ) : (
                    <Empty text="No hay trabajo pendiente para este evento. Las tareas operacionales aparecerán aquí automáticamente." />
                  )}
                </div>
              </Section>
            </OptionalModule>
          )}

          <section className="grid gap-6 xl:grid-cols-2">
            {moduleVisible("TIMELINE") && (
              <OptionalModule moduleKey="TIMELINE" onHide={hideModule}>
                <Section
                  eyebrow="06 · Historial inmutable"
                  icon={<History className="size-5" />}
                  id="timeline"
                  title="Timeline completo"
                >
                  <ol className="max-h-[620px] space-y-0 overflow-y-auto pr-2">
                    {event.timeline.length ? (
                      event.timeline.map((item) => (
                        <li
                          className="relative border-l pb-6 pl-5 last:pb-0"
                          key={item.id}
                        >
                          <span className="absolute -left-1.5 top-1 size-3 rounded-full border-2 border-card bg-brand" />
                          <p className="text-sm font-medium">{item.message}</p>
                          <p className="mt-1 text-xs text-muted">
                            {item.actor} · {item.source} ·{" "}
                            {dateTime(item.occurredAt)}
                          </p>
                        </li>
                      ))
                    ) : (
                      <Empty text="Las acciones comerciales, operacionales y del cliente aparecerán aquí." />
                    )}
                  </ol>
                </Section>
              </OptionalModule>
            )}
            {moduleVisible("DOCUMENTS") && (
              <Section
                eyebrow="07 · Archivos"
                icon={<FolderOpen className="size-5" />}
                id="documents"
                title="Documentos"
              >
                <div className="space-y-3">
                  {event.documents.length ? (
                    event.documents.map((doc) => (
                      <article
                        className="flex items-center justify-between gap-3 rounded-xl border p-4"
                        key={doc.id}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="size-5 shrink-0 text-brand" />
                          <div>
                            <p className="font-medium">
                              {humanDocument(doc.type)}
                            </p>
                            <p className="text-xs text-muted">
                              {dateTime(doc.createdAt)}
                            </p>
                          </div>
                        </div>
                        {doc.href ? (
                          <a
                            aria-label={`Descargar ${humanDocument(doc.type)}`}
                            className="grid size-10 shrink-0 place-items-center rounded-lg border hover:border-brand"
                            href={doc.href}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <Download className="size-4" />
                          </a>
                        ) : (
                          <StatusBadge
                            label="Archivo protegido"
                            variant="neutral"
                          />
                        )}
                      </article>
                    ))
                  ) : (
                    <Empty text="Cotizaciones, acuerdos, comprobantes, diseños y galerías aparecerán aquí cuando estén disponibles." />
                  )}
                </div>
              </Section>
            )}
            {moduleVisible("GOOGLE_CALENDAR") && (
              <Section
                eyebrow="08 · Agenda"
                icon={<CalendarDays className="size-5" />}
                id="google-calendar"
                title="Google Calendar"
              >
                <dl>
                  <Row
                    label="Estado"
                    value={
                      <Connector
                        status={event.google.calendarStatus}
                        href={event.google.calendarUrl}
                      />
                    }
                  />
                </dl>
              </Section>
            )}
            {moduleVisible("CUSTOMER_PORTAL") && (
              <Section
                eyebrow="09 · Cliente"
                icon={<Link2 className="size-5" />}
                id="customer-portal"
                title="Customer Portal"
              >
                <dl>
                  <Row
                    label="Portal"
                    value={
                      portalUrl ? (
                        <a
                          className="text-brand hover:underline"
                          href={portalUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Abrir portal
                        </a>
                      ) : (
                        "Sin enlace activo"
                      )
                    }
                  />
                </dl>
                <button
                  className="mt-4 rounded-lg border px-4 py-2 text-sm font-medium hover:border-brand"
                  onClick={generatePortal}
                  type="button"
                >
                  {portalUrl ? "Regenerar acceso" : "Generar portal"}
                </button>
              </Section>
            )}
            {moduleVisible("GOOGLE_WORKSPACE") && (
              <OptionalModule moduleKey="GOOGLE_WORKSPACE" onHide={hideModule}>
                <Section
                  eyebrow="10 · Integraciones"
                  icon={<ExternalLink className="size-5" />}
                  id="google"
                  title="Google Workspace"
                >
                  <dl>
                    <Row
                      label="Google Drive"
                      value={
                        <Connector
                          status={event.google.driveStatus}
                          href={event.google.driveUrl}
                        />
                      }
                    />
                    <Row
                      label="Última sincronización"
                      value={
                        event.google.driveLastSyncedAt
                          ? dateTime(event.google.driveLastSyncedAt)
                          : "Pendiente"
                      }
                    />
                    <Row
                      label="Gmail"
                      value={<Connector status={event.google.gmailStatus} />}
                    />
                    <Row
                      label="Thread"
                      value={event.google.gmailThread ?? "Sin conversación"}
                    />
                  </dl>
                </Section>
              </OptionalModule>
            )}
            {moduleVisible("FINANCIAL_SUMMARY") && (
              <Section
                eyebrow="09 · Rentabilidad real"
                icon={<Gauge className="size-5" />}
                id="event-finance"
                title="Resumen financiero del evento"
              >
                {event.profit ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <MiniMoney
                        label="Ingresos"
                        value={event.profit.revenue.finalSaleValue}
                      />
                      <MiniMoney
                        label="Costo operacional"
                        value={event.profit.costs.totalOperationalCost}
                      />
                      <MiniMoney
                        label="Profit bruto"
                        value={event.profit.profit.grossProfit}
                      />
                      <MiniMetric
                        label="Margen"
                        value={Number(
                          event.profit.profit.grossMarginPercent.toFixed(1),
                        )}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                          Ingresos
                        </p>
                        <dl>
                          <Row
                            label="Servicio contratado"
                            value={money(
                              event.profit.revenue.contractedService,
                            )}
                          />
                          <Row
                            label="Extras"
                            value={money(event.profit.revenue.extras)}
                          />
                          <Row
                            label="Transporte"
                            value={money(event.profit.revenue.transport)}
                          />
                          <Row
                            label="Descuento"
                            value={`−${money(event.profit.revenue.discount)}`}
                          />
                          <Row
                            label="Venta final"
                            value={money(event.profit.revenue.finalSaleValue)}
                          />
                        </dl>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                          Costos automáticos
                        </p>
                        <dl>
                          <Row
                            label="Operador"
                            value={money(event.profit.costs.operator)}
                          />
                          <Row
                            label="Montaje / desmontaje"
                            value={money(
                              event.profit.costs.setup +
                                event.profit.costs.teardown,
                            )}
                          />
                          <Row
                            label="Combustible asignado"
                            value={money(event.profit.costs.allocatedFuel)}
                          />
                          <Row
                            label="Papel e impresión"
                            value={money(event.profit.costs.paper)}
                          />
                          <Row
                            label="Imanes"
                            value={money(event.profit.costs.magnets)}
                          />
                          <Row
                            label="Scrapbook"
                            value={money(event.profit.costs.scrapbook)}
                          />
                          <Row
                            label="Branding"
                            value={money(event.profit.costs.branding)}
                          />
                          <Row
                            label="Vehículo"
                            value={money(event.profit.costs.vehicle)}
                          />
                          <Row
                            label="Otros gastos"
                            value={money(
                              event.profit.costs.otherExpenses +
                                event.profit.costs.staffOther,
                            )}
                          />
                        </dl>
                      </div>
                    </div>
                    <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
                      <Row
                        label="Profit neto"
                        value={money(event.profit.profit.netProfit)}
                      />
                      <Row
                        label="Margen neto"
                        value={`${event.profit.profit.netMarginPercent.toFixed(1)}%`}
                      />
                      <Row
                        label="Ingreso original"
                        value={money(event.profit.history.originalRevenue)}
                      />
                      <Row
                        label="Costo original"
                        value={money(event.profit.history.originalCost)}
                      />
                    </div>
                    <p className="text-xs text-muted">
                      Recalculado {dateTime(event.profit.calculatedAt)} ·
                      historial conservado en Profit.
                    </p>
                  </div>
                ) : (
                  <Empty text="La rentabilidad aparecerá cuando el evento tenga una cotización productiva." />
                )}
              </Section>
            )}
            {moduleVisible("PAYROLL") && (
              <OptionalModule moduleKey="PAYROLL" onHide={hideModule}>
                <Section
                  eyebrow="10 · Costos de equipo"
                  icon={<UsersRound className="size-5" />}
                  id="payroll"
                  title="Payroll"
                >
                  <div className="space-y-3">
                    {event.payroll.length ? (
                      event.payroll.map((payment, index) => (
                        <article
                          className="rounded-xl border p-4"
                          key={`${payment.staff}-${index}`}
                        >
                          <div className="flex justify-between gap-3">
                            <p className="font-semibold">{payment.staff}</p>
                            <StatusBadge
                              label={payment.status}
                              variant="info"
                            />
                          </div>
                          <dl className="mt-3">
                            <Row
                              label="Montaje"
                              value={money(payment.assembly)}
                            />
                            <Row
                              label="Operación"
                              value={money(payment.operator)}
                            />
                            <Row
                              label="Desmontaje"
                              value={money(payment.disassembly)}
                            />
                            <Row
                              label="Transporte"
                              value={money(payment.transport)}
                            />
                            <Row
                              label="Estacionamiento"
                              value={money(payment.parking)}
                            />
                            <Row label="Total" value={money(payment.total)} />
                          </dl>
                        </article>
                      ))
                    ) : (
                      <Empty text="El cálculo de payroll aparecerá cuando exista Staff asignado al evento." />
                    )}
                  </div>
                </Section>
              </OptionalModule>
            )}
          </section>

          {moduleVisible("EVENT_HEALTH") && (
            <OptionalModule moduleKey="EVENT_HEALTH" onHide={hideModule}>
              <Section
                eyebrow="10 · Lectura ejecutiva"
                icon={<Gauge className="size-5" />}
                id="health"
                title="Event Health"
              >
                <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
                  <div className="grid place-items-center rounded-2xl border bg-background/30 p-6 text-center">
                    <p className="text-5xl font-semibold tracking-tight">
                      {health}%
                    </p>
                    <StatusBadge label={healthLabel} variant={healthVariant} />
                    <p className="mt-3 text-xs leading-5 text-muted">
                      Indicador informativo. No bloquea la operación.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {readiness.map((item) => (
                      <div className="rounded-xl border p-4" key={item.label}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium">{item.label}</p>
                          <StatusBadge
                            label={statePresentation[item.state].label}
                            variant={statePresentation[item.state].variant}
                          />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted">
                          {item.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            </OptionalModule>
          )}

          <Section
            eyebrow="11 · Decisiones"
            icon={<ClipboardCheck className="size-5" />}
            id="quick-actions"
            title="Acciones rápidas"
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <ActionButton
                icon={FileText}
                label="Generar acuerdo"
                onClick={() => scroll("agreement-control")}
              />
              <ActionButton
                icon={Send}
                label="Enviar acuerdo"
                onClick={() => scroll("agreement-control")}
                variant="outline"
              />
              <ActionButton
                icon={Link2}
                label={portalUrl ? "Abrir portal" : "Generar portal"}
                onClick={
                  portalUrl
                    ? () =>
                        window.open(portalUrl, "_blank", "noopener,noreferrer")
                    : generatePortal
                }
                variant="outline"
              />
              <ActionButton
                icon={UserRound}
                label="Asignar Staff"
                onClick={() => scroll("staff-assignment")}
                variant="outline"
              />
              <ActionButton
                icon={Package}
                label="Asignar equipo"
                onClick={() => scroll("equipment-assignment")}
                variant="outline"
              />
              <ActionButton
                icon={CalendarDays}
                label="Generar Calendar"
                onClick={() => scroll("event-readiness")}
                variant="outline"
              />
              <ActionButton
                icon={FolderOpen}
                label="Abrir Carpeta Cliente"
                disabled={!event.google.driveUrl}
                onClick={() =>
                  event.google.driveUrl &&
                  window.open(
                    event.google.driveUrl,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                variant="outline"
              />
              <ActionButton
                icon={Download}
                label="Generar galería"
                onClick={() => scroll("post-event")}
                variant="outline"
              />
              <ActionButton
                icon={CheckCircle2}
                label="Cerrar evento"
                onClick={() => scroll("post-event")}
                variant="outline"
              />
              <ActionButton
                icon={ExternalLink}
                label="Duplicar evento"
                onClick={() => router.push("/projects/new")}
                variant="outline"
              />
              {["ARCHIVED", "CANCELLED", "CANCELED"].includes(
                event.status.toUpperCase(),
              ) ? (
                <ActionButton
                  icon={RotateCcw}
                  label="Restaurar reserva"
                  onClick={() => void lifecycle("RESTORE")}
                  variant="outline"
                />
              ) : (
                <>
                  <ActionButton
                    icon={Archive}
                    label="Archivar reserva"
                    onClick={() => void lifecycle("ARCHIVE")}
                    variant="outline"
                  />
                  <ActionButton
                    icon={Ban}
                    label="Cancelar reserva"
                    onClick={() => void lifecycle("CANCEL")}
                    variant="outline"
                  />
                </>
              )}
              <ActionButton
                icon={Trash2}
                label="Eliminar permanentemente"
                onClick={() => void lifecycle("PERMANENT_DELETE")}
                variant="outline"
              />
            </div>
            {portalFeedback && (
              <p aria-live="polite" className="mt-3 text-sm text-muted">
                {portalFeedback}
              </p>
            )}
            {customerDeleteFeedback && (
              <p aria-live="polite" className="mt-3 text-sm text-danger">
                {customerDeleteFeedback}
              </p>
            )}
          </Section>

          {moduleVisible("MILESTONES") && (
            <OptionalModule moduleKey="MILESTONES" onHide={hideModule}>
              <Section
                eyebrow="12 · Post evento"
                icon={<CheckCircle2 className="size-5" />}
                id="post-event"
                title="Cierre del evento"
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Checklist", event.checklist.status === "COMPLETED"],
                    [
                      "Galería cargada",
                      props.workspaceData.gallery === "Disponible",
                    ],
                    ["Operador confirmado", Boolean(operator)],
                    ["Payroll calculado", event.payroll.length > 0],
                    ["Profit calculado", Boolean(event.profit)],
                    [
                      "Reseña solicitada",
                      event.timeline.some((x) =>
                        x.message.toLowerCase().includes("reseña"),
                      ),
                    ],
                    ["Evento archivado", event.status === "Archived"],
                  ].map(([label, done]) => (
                    <div
                      className="flex items-center gap-3 rounded-xl border p-4"
                      key={String(label)}
                    >
                      {done ? (
                        <CheckCircle2 className="size-5 text-success" />
                      ) : (
                        <Clock3 className="size-5 text-muted" />
                      )}
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                  ))}
                </div>
              </Section>
              <ExperienceReviewEngine
                existing={event.experienceReview.existing}
                knowledge={event.experienceReview.knowledge}
                projectId={props.projectKey ?? ""}
                staff={{
                  operator: operator?.name,
                  assembly: assembly?.name,
                  disassembly: disassembly?.name,
                }}
              />
            </OptionalModule>
          )}

          {moduleVisible("OPERATIONAL_CONTROL") && (
            <OptionalModule moduleKey="OPERATIONAL_CONTROL" onHide={hideModule}>
              <div id="equipment-assignment">
                <EquipmentAssignmentPanel {...props.equipment} />
              </div>
              <ProductionIntegrationPanel {...props.productionIntegration} />
            </OptionalModule>
          )}
          {moduleVisible("DOCUMENTS") && (
            <div id="agreement-control">
              <AgreementSigningControl
                agreementId={props.signing.agreementId}
                projectId={props.projectKey ?? ""}
                status={props.signing.status}
              />
            </div>
          )}
        </div>
      }
      bottomAction={
        moduleVisible("EVENT_HEALTH") ? (
          <div className="sticky bottom-3 z-10 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {healthLabel} · {health}%
                </p>
                <p className="text-xs text-muted">
                  {intelligence.timeline.nextAction}
                </p>
              </div>
              <ActionButton
                icon={AlertTriangle}
                label={
                  missing ? `Resolver ${missing} pendientes` : "Evento listo"
                }
                onClick={() => scroll("health")}
                variant={missing ? "default" : "outline"}
              />
            </div>
          </div>
        ) : null
      }
    />
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/30 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-sm font-semibold">{value}</p>
    </div>
  );
}
function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-background/30 p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
function MiniMoney({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-background/30 p-4">
      <p className="text-xl font-semibold sm:text-2xl">{money(value)}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
function Connector({ status, href }: { status: string; href?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge
        label={status}
        variant={
          ["SYNCHRONIZED", "CREATED", "SENT", "DELIVERED"].includes(status)
            ? "success"
            : "warning"
        }
      />
      {href && (
        <a
          aria-label="Abrir integración"
          className="text-brand"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="size-4" />
        </a>
      )}
    </span>
  );
}
function humanDocument(type: string) {
  return (
    (
      {
        QUOTATION: "Cotización",
        AGREEMENT: "Acuerdo",
        SIGNED_AGREEMENT: "Acuerdo firmado",
        INVOICE: "Factura",
        PAYMENT_RECEIPT: "Comprobante de pago",
        DESIGN: "Archivo de diseño",
        GALLERY: "Galería",
      } as Record<string, string>
    )[type] ?? type.replaceAll("_", " ")
  );
}

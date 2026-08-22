"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarPlus,
  Eye,
  History,
  Pencil,
  Search,
  UserX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RutInput } from "@/components/forms/rut-input";
import {
  assignOperationalStaffAction,
  createOperationalStaffAction,
  disableOperationalStaffAction,
  updateOperationalStaffAction,
  type StaffOperationalRecord,
  type StaffSkill,
  type StaffStoredStatus,
} from "./staff-operation-center.actions";
import { StaffPinReset } from "@/features/portal-authentication/staff-pin-reset";
import {
  StaffPaymentsCenter,
  type StaffPaymentEvent,
  type StaffPaymentMonth,
} from "@/features/staff-payments";
import { StaffDocumentCenter } from "@/features/staff-documents/staff-document-center";

export interface StaffProjectOption {
  id: string;
  label: string;
  service: string;
  date: string;
}
export interface StaffVehicleOption {
  id: string;
  label: string;
}
export interface StaffPortalAccess {
  id: string;
  name: string;
  rut: string;
  email: string;
  enabled: boolean;
  hasPin: boolean;
  firstLoginPending: boolean;
  invitationSentAt: string | null;
  lastLoginAt: string | null;
}
const skillOptions: readonly { value: StaffSkill; label: string }[] = [
  { value: "OPERATOR", label: "Operador" },
  { value: "ASSEMBLY", label: "Montaje" },
  { value: "DISASSEMBLY", label: "Desmontaje" },
];
const skillLabel = (skill: string) =>
  skillOptions.find((item) => item.value === skill)?.label ?? skill;
const statusOptions: readonly { value: StaffStoredStatus; label: string }[] = [
  { value: "ACTIVE", label: "Disponible" },
  { value: "VACATION", label: "Vacaciones" },
  { value: "MEDICAL_LEAVE", label: "Licencia médica" },
  { value: "INACTIVE", label: "Inactivo" },
  { value: "DISABLED", label: "Deshabilitado" },
];
const statusLabel = (item: StaffOperationalRecord) =>
  item.status === "ACTIVE" &&
  item.assignments.some((assignment) =>
    [
      "ASSIGNED",
      "PENDING",
      "PENDING_CONFIRMATION",
      "ACCEPTED",
      "CONFIRMED",
    ].includes(assignment.status),
  )
    ? "Asignado"
    : (statusOptions.find((status) => status.value === item.status)?.label ??
      item.status);
type Panel =
  | { kind: "create" }
  | { kind: "view" | "edit" | "history"; item: StaffOperationalRecord }
  | { kind: "assign" }
  | null;
type Filter =
  | "ALL"
  | "OPERATOR"
  | "ASSEMBLY"
  | "DISASSEMBLY"
  | "AVAILABLE"
  | "ASSIGNED";

export function StaffOperationCenter({
  initialStaff,
  projects,
  vehicles,
  portalAccess,
  paymentEvents,
  paymentMonths,
}: {
  initialStaff: StaffOperationalRecord[];
  projects: StaffProjectOption[];
  vehicles: StaffVehicleOption[];
  portalAccess: StaffPortalAccess[];
  paymentEvents: StaffPaymentEvent[];
  paymentMonths: StaffPaymentMonth[];
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = useMemo(
    () =>
      staff.filter((item) => {
        const assigned = item.assignments.some((assignment) =>
          ["PENDING", "ACCEPTED"].includes(assignment.status),
        );
        const filterSkill = (
          ["OPERATOR", "ASSEMBLY", "DISASSEMBLY"] as string[]
        ).includes(filter)
          ? (filter as StaffSkill)
          : null;
        const filterMatch =
          filter === "ALL" ||
          (filter === "AVAILABLE"
            ? item.status === "ACTIVE" && !assigned
            : filter === "ASSIGNED"
              ? assigned
              : filterSkill
                ? item.skills.includes(filterSkill)
                : false);
        const haystack =
          `${item.firstName} ${item.lastName} ${item.rut} ${item.skills.map(skillLabel).join(" ")} ${statusLabel(item)}`.toLocaleLowerCase(
            "es",
          );
        return (
          filterMatch && haystack.includes(query.trim().toLocaleLowerCase("es"))
        );
      }),
    [filter, query, staff],
  );
  const save = (data: FormData, editing: boolean) => {
    setError("");
    startTransition(async () => {
      const result = editing
        ? await updateOperationalStaffAction(data)
        : await createOperationalStaffAction(data);
      if (!result.ok) return setError(result.error);
      setStaff((current) =>
        editing
          ? current.map((item) =>
              item.id === result.staff.id
                ? {
                    ...result.staff,
                    assignments: item.assignments,
                    history: item.history,
                    documents: item.documents,
                    associatedExpenses: item.associatedExpenses,
                    financial: item.financial,
                  }
                : item,
            )
          : [result.staff, ...current],
      );
      setPanel(null);
    });
  };
  const disable = (item: StaffOperationalRecord) => {
    if (!window.confirm(`¿Deshabilitar a ${item.firstName} ${item.lastName}?`))
      return;
    startTransition(async () => {
      const result = await disableOperationalStaffAction(item);
      if (!result.ok) return setError(result.error);
      setStaff((current) =>
        current.map((member) =>
          member.id === item.id ? result.staff : member,
        ),
      );
    });
  };
  const assign = (data: FormData) => {
    setError("");
    startTransition(async () => {
      const result = await assignOperationalStaffAction(data);
      if (!result.ok) return setError(result.error);
      const selected = String(data.get("staffId"));
      const responsibilities = data.getAll("responsibilities").map(String);
      const project = projects.find(
        (item) => item.id === String(data.get("projectId")),
      );
      const vehicle = vehicles.find(
        (item) => item.id === String(data.get("vehicle")),
      );
      setStaff((current) =>
        current.map((item) =>
          item.id === selected
            ? {
                ...item,
                assignments: [
                  ...responsibilities.map((role, index) => ({
                    id: result.assignmentIds[index] ?? crypto.randomUUID(),
                    projectId: project?.id ?? "",
                    eventName: project?.label ?? "Evento",
                    service: project?.service ?? "Servicio",
                    date: project?.date ?? "",
                    vehicle: vehicle?.label ?? "Sin vehículo",
                    role,
                    status: "PENDING",
                    arrivalTime: "",
                    startTime: "",
                    finishTime: "",
                  })),
                  ...item.assignments,
                ],
              }
            : item,
        ),
      );
      setPanel(null);
    });
  };
  return (
    <section className="space-y-6" aria-labelledby="staff-center-title">
      <header className="rounded-2xl border bg-card px-5 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand">
              STAFF · OPERACIÓN BOOMBOX
            </p>
            <h1
              id="staff-center-title"
              className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl"
            >
              Centro Operacional de Staff
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Operador, Montaje y Desmontaje: responsabilidades combinables que
              generan pagos automáticamente.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setPanel({ kind: "assign" })}
            >
              <CalendarPlus className="size-4" />
              Asignar Staff
            </Button>
          </div>
        </div>
      </header>
      <div className="rounded-2xl border bg-card p-4">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <span className="sr-only">Buscar Staff</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, RUT, responsabilidad o estado"
            className="h-11 w-full rounded-xl border bg-background pl-10 pr-3"
          />
        </label>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {(
            [
              { value: "ALL", label: "Todos" },
              { value: "OPERATOR", label: "Operadores" },
              { value: "ASSEMBLY", label: "Montaje" },
              { value: "DISASSEMBLY", label: "Desmontaje" },
              { value: "AVAILABLE", label: "Disponibles" },
              { value: "ASSIGNED", label: "Asignados" },
            ] as { value: Filter; label: string }[]
          ).map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${filter === option.value ? "border-brand bg-brand text-white" : "bg-background"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600"
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) => (
          <article key={item.id} className="rounded-2xl border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">
                  {item.firstName} {item.lastName}
                </p>
                <p className="mt-1 text-sm text-muted">{item.rut}</p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusLabel(item) === "Disponible" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : statusLabel(item) === "Asignado" ? "border-blue-500/30 bg-blue-500/10 text-blue-600" : "border-amber-500/30 bg-amber-500/10 text-amber-600"}`}
              >
                {statusLabel(item)}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.skills.map((skill) => (
                <span
                  className="rounded-full border bg-background px-2.5 py-1 text-xs"
                  key={skill}
                >
                  {skillLabel(skill)}
                </span>
              ))}
            </div>
            <p className="mt-5 text-xs text-muted">
              Responsabilidades asignadas
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {item.assignments.length}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              <Action
                icon={<Eye />}
                label="Abrir"
                onClick={() => setPanel({ kind: "view", item })}
              />
              <Action
                icon={<Pencil />}
                label="Editar"
                onClick={() => setPanel({ kind: "edit", item })}
              />
              <Action
                icon={<UserX />}
                label="Deshabilitar"
                disabled={pending || item.status === "DISABLED"}
                onClick={() => disable(item)}
              />
              <Action
                icon={<History />}
                label="Historial"
                onClick={() => setPanel({ kind: "history", item })}
              />
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <p className="font-semibold">No encontramos Staff</p>
          <p className="mt-1 text-sm text-muted">
            Ajusta la búsqueda o agrega un colaborador.
          </p>
        </div>
      )}
      {panel && (
        <StaffPanel
          panel={panel}
          staff={staff}
          projects={projects}
          vehicles={vehicles}
          portalAccess={portalAccess}
          paymentEvents={paymentEvents}
          paymentMonths={paymentMonths}
          error={error}
          pending={pending}
          onClose={() => {
            setPanel(null);
            setError("");
          }}
          onSave={save}
          onAssign={assign}
        />
      )}
    </section>
  );
}

function StaffPanel({
  panel,
  staff,
  projects,
  vehicles,
  portalAccess,
  paymentEvents,
  paymentMonths,
  error,
  pending,
  onClose,
  onSave,
  onAssign,
}: {
  panel: Exclude<Panel, null>;
  staff: StaffOperationalRecord[];
  projects: StaffProjectOption[];
  vehicles: StaffVehicleOption[];
  portalAccess: StaffPortalAccess[];
  paymentEvents: StaffPaymentEvent[];
  paymentMonths: StaffPaymentMonth[];
  error: string;
  pending: boolean;
  onClose: () => void;
  onSave: (data: FormData, editing: boolean) => void;
  onAssign: (data: FormData) => void;
}) {
  const item =
    panel.kind === "create" || panel.kind === "assign" ? null : panel.item;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 sm:max-w-3xl sm:rounded-2xl sm:p-7">
        <div className="flex justify-between">
          <div>
            <p className="text-xs font-semibold text-brand">STAFF</p>
            <h2 className="mt-1 text-2xl font-semibold">
              {panel.kind === "create"
                ? "Agregar Staff"
                : panel.kind === "edit"
                  ? "Editar Staff"
                  : panel.kind === "assign"
                    ? "Asignar Staff"
                    : panel.kind === "history"
                      ? "Historial"
                      : `${item?.firstName} ${item?.lastName}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg border p-2"
          >
            <X className="size-4" />
          </button>
        </div>
        {panel.kind === "assign" ? (
          <AssignmentForm
            staff={staff}
            projects={projects}
            vehicles={vehicles}
            error={error}
            pending={pending}
            onSubmit={onAssign}
          />
        ) : panel.kind === "history" && item ? (
          <div className="mt-6 space-y-3">
            {item.history.map((entry) => (
              <div key={entry.id} className="rounded-xl border p-4">
                <p className="text-sm font-medium">{entry.message}</p>
                <p className="mt-1 text-xs text-muted">{entry.occurredAt}</p>
              </div>
            ))}
            {!item.history.length && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
                Sin movimientos registrados.
              </p>
            )}
          </div>
        ) : panel.kind === "view" && item ? (
          <ProfileView
            access={portalAccess.find((access) => access.id === item.id)}
            item={item}
            paymentEvents={paymentEvents.filter(
              (event) => event.staffId === item.id,
            )}
            paymentMonths={paymentMonths.filter(
              (month) => month.staffId === item.id,
            )}
          />
        ) : (
          <StaffForm
            item={item}
            error={error}
            pending={pending}
            onSubmit={onSave}
          />
        )}
      </div>
    </div>
  );
}
function ProfileView({
  item,
  access,
  paymentEvents,
  paymentMonths,
}: {
  item: StaffOperationalRecord;
  access?: StaffPortalAccess;
  paymentEvents: StaffPaymentEvent[];
  paymentMonths: StaffPaymentMonth[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const active = item.assignments.filter(
    (x) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(x.status),
  );
  const upcoming = active.filter((x) => x.date >= today);
  const past = item.assignments.filter(
    (x) =>
      x.date < today ||
      ["COMPLETED", "CANCELLED", "REJECTED"].includes(x.status),
  );
  return (
    <div className="mt-6 space-y-6">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Detail label="Foto" value="Sin fotografía" />
        <Detail label="RUT" value={item.rut} />
        <Detail label="Teléfono" value={item.phone} />
        <Detail label="Correo" value={item.email} />
        <Detail
          label="Habilidades"
          value={item.skills.map(skillLabel).join(" · ")}
        />
        <Detail label="Estado" value={statusLabel(item)} />
        <Detail
          label="Próximos eventos"
          value={String(item.financial.upcomingEvents)}
        />
        <Detail
          label="Eventos completados"
          value={String(item.financial.completedEvents)}
        />
        <Detail
          label="Pagos pendientes"
          value={new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: "CLP",
            maximumFractionDigits: 0,
          }).format(item.financial.pendingPayments)}
        />
        <Detail
          label="Ingresos generados"
          value={new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: "CLP",
            maximumFractionDigits: 0,
          }).format(item.financial.revenueGenerated)}
        />
        <Detail
          label="Costo total"
          value={new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: "CLP",
            maximumFractionDigits: 0,
          }).format(item.financial.totalCost)}
        />
        <Detail label="Promedio de evaluación" value="Próximamente" />
        <Detail
          label="Banco"
          value={`${item.bank} · ${item.accountType} · ${item.accountNumber}`}
        />
        <Detail
          label="Emergencia"
          value={`${item.emergencyName} · ${item.emergencyPhone}`}
        />
      </dl>
      {access ? <StaffPinReset members={[access]} /> : null}
      <StaffDocumentCenter
        initialDocuments={item.documents}
        staffId={item.id}
        staffName={`${item.firstName} ${item.lastName}`}
      />
      <StaffPaymentsCenter
        staff={[
          {
            id: item.id,
            name: `${item.firstName} ${item.lastName}`,
            rut: item.rut,
          },
        ]}
        events={paymentEvents}
        months={paymentMonths}
      />
      <AssociatedExpenses items={item.associatedExpenses} />
      <AssignmentList title="Asignación actual" items={active} />
      <AssignmentList title="Próximos eventos" items={upcoming} />
      <AssignmentList title="Eventos anteriores" items={past} />
    </div>
  );
}
function AssociatedExpenses({
  items = [],
}: {
  items?: StaffOperationalRecord["associatedExpenses"];
}) {
  const money = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
  return (
    <section className="rounded-2xl border p-5">
      <h3 className="font-semibold">Gastos asociados del Evento</h3>
      <p className="mt-1 text-xs text-muted">
        Aumentan el costo del Evento, pero nunca la liquidación ni Payroll.
      </p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <a
            className="block rounded-xl border p-4 transition hover:border-brand"
            href={`/projects/${item.projectId}#expenses`}
            key={item.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{item.eventName}</p>
                <p className="mt-1 text-xs text-muted">
                  {item.date} · {item.category}
                </p>
                <p className="mt-1 text-sm">
                  {item.description || "Gasto operacional"}
                </p>
                <p
                  className={`mt-2 text-xs font-semibold ${item.status === "PAID" ? "text-emerald-500" : "text-amber-500"}`}
                >
                  {item.status === "PAID" ? "Reembolsado" : "Pendiente"}
                </p>
              </div>
              <strong>{money.format(item.amount)}</strong>
            </div>
          </a>
        ))}
        {!items.length && (
          <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted">
            Sin gastos del Evento asociados.
          </p>
        )}
      </div>
    </section>
  );
}
function AssignmentList({
  title,
  items,
}: {
  title: string;
  items: StaffOperationalRecord["assignments"];
}) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 space-y-3">
        {items.map((assignment) => (
          <div key={assignment.id} className="rounded-xl border p-4">
            <p className="font-medium">{assignment.eventName}</p>
            <p className="mt-1 text-sm text-muted">
              {assignment.service} · {assignment.date}
            </p>
            <p className="mt-2 text-sm">
              {assignment.vehicle} · {assignment.role} · {assignment.status}
            </p>
            <p className="mt-1 text-xs text-muted">
              Llegada {assignment.arrivalTime || "—"} · Inicio{" "}
              {assignment.startTime || "—"} · Término{" "}
              {assignment.finishTime || "—"}
            </p>
          </div>
        ))}
        {!items.length && <p className="text-sm text-muted">Sin registros.</p>}
      </div>
    </section>
  );
}
function StaffForm({
  item,
  error,
  pending,
  onSubmit,
}: {
  item: StaffOperationalRecord | null;
  error: string;
  pending: boolean;
  onSubmit: (data: FormData, editing: boolean) => void;
}) {
  return (
    <form
      action={(data) => onSubmit(data, !!item)}
      className="mt-6 grid gap-4 sm:grid-cols-2"
    >
      {item && (
        <>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="version" value={item.version} />
        </>
      )}
      <Field label="Nombre" name="firstName" defaultValue={item?.firstName} />
      <Field label="Apellido" name="lastName" defaultValue={item?.lastName} />
      <label className="text-sm font-medium">RUT<RutInput className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" defaultValue={item?.rut} /></label>
      <Field label="Teléfono" name="phone" defaultValue={item?.phone} />
      <Field
        label="Correo"
        name="email"
        type="email"
        defaultValue={item?.email}
      />
      <Select
        label="Estado"
        name="status"
        defaultValue={item?.status ?? "ACTIVE"}
        options={statusOptions}
      />
      <fieldset className="rounded-xl border p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-semibold">Habilidades</legend>
        <p className="mb-3 text-xs text-muted">
          Selecciona una o más funciones operacionales.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {skillOptions.map((skill) => (
            <label
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm"
              key={skill.value}
            >
              <input
                defaultChecked={item?.skills.includes(skill.value)}
                name="skills"
                type="checkbox"
                value={skill.value}
              />
              {skill.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Banco" name="bank" defaultValue={item?.bank} />
      <Select
        label="Tipo de cuenta"
        name="accountType"
        defaultValue={item?.accountType ?? "CUENTA_CORRIENTE"}
        options={[
          { value: "CUENTA_CORRIENTE", label: "Cuenta Corriente" },
          { value: "CUENTA_VISTA", label: "Cuenta Vista" },
          { value: "CUENTA_RUT", label: "Cuenta RUT" },
          { value: "AHORRO", label: "Ahorro" },
        ]}
      />
      <Field
        label="Número de cuenta"
        name="accountNumber"
        defaultValue={item?.accountNumber}
      />
      <Field
        label="Contacto de emergencia"
        name="emergencyName"
        defaultValue={item?.emergencyName}
      />
      <Field
        label="Teléfono de emergencia"
        name="emergencyPhone"
        defaultValue={item?.emergencyPhone}
      />
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      <Button className="sm:col-span-2" disabled={pending}>
        {pending ? "Guardando..." : item ? "Guardar cambios" : "Agregar Staff"}
      </Button>
    </form>
  );
}
function AssignmentForm({
  staff,
  projects,
  vehicles,
  error,
  pending,
  onSubmit,
}: {
  staff: StaffOperationalRecord[];
  projects: StaffProjectOption[];
  vehicles: StaffVehicleOption[];
  error: string;
  pending: boolean;
  onSubmit: (data: FormData) => void;
}) {
  return (
    <form action={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
      <Select
        label="Evento"
        name="projectId"
        defaultValue=""
        options={[
          { value: "", label: "Seleccionar evento" },
          ...projects.map((item) => ({ value: item.id, label: item.label })),
        ]}
      />
      <Select
        label="Colaborador"
        name="staffId"
        defaultValue=""
        options={[
          { value: "", label: "Seleccionar Staff" },
          ...staff
            .filter((item) => item.status === "ACTIVE")
            .map((item) => ({
              value: item.id,
              label: `${item.firstName} ${item.lastName}`,
            })),
        ]}
      />
      <Select
        label="Vehículo"
        name="vehicle"
        defaultValue=""
        options={[
          { value: "", label: "Sin vehículo" },
          ...vehicles.map((item) => ({ value: item.id, label: item.label })),
        ]}
      />
      <Field
        label="Motivo"
        name="reason"
        defaultValue="Asignación operacional"
      />
      <fieldset className="sm:col-span-2 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">
          Responsabilidades del evento
        </legend>
        <p className="mb-3 text-xs text-muted">
          Selecciona cualquier combinación válida. Cada responsabilidad genera
          su costo desde Cost Master.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {skillOptions.map((item) => (
            <label
              className="flex min-h-12 items-center gap-3 rounded-xl border px-4 text-sm font-medium"
              key={item.value}
            >
              <input
                name="responsibilities"
                type="checkbox"
                value={item.value}
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      <Button className="sm:col-span-2" disabled={pending}>
        {pending ? "Asignando..." : "Confirmar responsabilidades"}
      </Button>
    </form>
  );
}
function Action({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactElement;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-40 ${danger ? "text-red-600" : ""}`}
    >
      <span className="mx-auto mb-1 block w-fit [&>svg]:size-4">{icon}</span>
      {label}
    </button>
  );
}
function Field({
  label,
  name,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        required
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="mt-2 h-11 w-full rounded-xl border bg-background px-3"
      />
    </label>
  );
}
function Select<T extends string>({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: T;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-2 h-11 w-full rounded-xl border bg-background px-3"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  if (["Pagos pendientes", "Ingresos generados", "Costo total"].includes(label))
    return null;
  return (
    <div className="rounded-xl border p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

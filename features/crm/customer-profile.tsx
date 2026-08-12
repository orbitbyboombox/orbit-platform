"use client";
import {
  ArrowLeft,
  Archive,
  CalendarDays,
  Copy,
  ExternalLink,
  FileSignature,
  Landmark,
  MoreVertical,
  ReceiptText,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomerEventOperations, CrmCustomerProfile, CrmEventSummary } from "./types";
import { CustomerEventOperations } from "./customer-event-operations";
import {
  duplicateCrmEventAction,
  transitionCrmEventAction,
  updateCrmCustomerAction,
  updateCrmEventAction,
} from "./actions";
export function CustomerProfile({
  customer,
  operations,
}: {
  customer: CrmCustomerProfile;
  operations: CrmCustomerEventOperations[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CrmEventSummary | null>(
    null,
  );
  const [error, setError] = useState("");
  const [managedEvent, setManagedEvent] = useState<string | null>(null);
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const eventEditorRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (editingEvent) eventEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingEvent]);
  useEffect(() => {
    if (editing) document.getElementById("customer-general-information")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);
  useEffect(() => {
    if (!pendingSection) return;
    const section = document.getElementById(pendingSection);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingSection(null);
    }
  }, [managedEvent, pendingSection]);
  const scrollTo = (id: string) =>
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  const openEventCenter = (
    section: "payments" | "contracts" | "documents" | "profitability",
  ) => {
    const target = customer.events.find((event) => {
      const operational = operations.find((item) => item.projectId === event.projectId);
      if (!operational) return false;
      if (section === "payments") return Boolean(operational.receivable);
      if (section === "contracts") return Boolean(operational.agreement);
      if (section === "documents") return operational.documents.length > 0 || operational.invoices.length > 0;
      return Boolean(operational.profitability);
    }) ?? customer.events[0];
    if (!target) return scrollTo("customer-events");
    setManagedEvent(target.projectId);
    setPendingSection(`${section}-${target.projectId}`);
  };
  const beginEventEdit = (event: CrmEventSummary) => {
    setEditingEvent(event);
  };
  const submit = (form: FormData) =>
    startTransition(async () => {
      const result = await updateCrmCustomerAction({
        id: customer.id,
        fullName: String(form.get("fullName")),
        rut: String(form.get("rut")),
        company: String(form.get("company")),
        phone: String(form.get("phone")),
        email: String(form.get("email")),
        address: String(form.get("address")),
        commercialNotes: String(form.get("commercialNotes")),
        contacts: parseContacts(String(form.get("contacts"))),
        reason: String(form.get("reason")),
      });
      if (!result.ok) setError(result.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  const runLifecycle = (
    event: CrmEventSummary,
    action: "ARCHIVE" | "PERMANENT_DELETE",
  ) => {
    const warning =
      action === "PERMANENT_DELETE"
        ? "Eliminar SOLO este Evento. El Cliente permanecerá dentro del CRM y su historial comercial será conservado. ¿Continuar?"
        : "El Evento quedará archivado y dejará de afectar la operación y las finanzas activas. ¿Continuar?";
    if (!window.confirm(warning)) return;
    const reason = window.prompt("Motivo obligatorio:")?.trim();
    if (!reason) return;
    startTransition(async () => {
      const result = await transitionCrmEventAction({
        customerId: customer.id,
        projectId: event.projectId,
        action,
        reason,
      });
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  };
  const duplicateEvent = (event: CrmEventSummary) => {
    const copyStaff = window.confirm(
      "¿Deseas copiar también las asignaciones de Staff como pendientes?",
    );
    const reason = window.prompt("Motivo de la duplicación:")?.trim();
    if (!reason) return;
    startTransition(async () => {
      const result = await duplicateCrmEventAction({
        customerId: customer.id,
        projectId: event.projectId,
        copyStaff,
        reason,
      });
      if (!result.ok) setError(result.error);
      else router.push(`/projects/${result.projectId}`);
    });
  };
  const submitEvent = (form: FormData) => {
    if (!editingEvent) return;
    startTransition(async () => {
      const result = await updateCrmEventAction({
        customerId: customer.id,
        projectId: editingEvent.projectId,
        date: String(form.get("date")),
        time: String(form.get("time")),
        type: String(form.get("type")),
        location: String(form.get("location")),
        eventAddress: String(form.get("eventAddress")),
        municipality: String(form.get("municipality")),
        service: String(form.get("service")),
        duration: String(form.get("duration")),
        boothQuantity: String(form.get("boothQuantity")),
        transport: String(form.get("transport")),
        extras: String(form.get("extras")),
        appliedPrice: String(form.get("appliedPrice")),
        reason: String(form.get("reason")),
      });
      if (!result.ok) setError(result.error);
      else {
        setEditingEvent(null);
        router.refresh();
      }
    });
  };
  return (
    <div className="space-y-7">
      <header>
        <Link
          className="inline-flex items-center gap-2 text-sm text-muted"
          href="/customers"
        >
          <ArrowLeft className="size-4" />
          Volver a Clientes
        </Link>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[.18em] text-muted">
              Ficha CRM
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{customer.fullName}</h1>
            <p className="mt-2 text-sm text-muted">
              {customer.company || "Cliente particular"} · {customer.rut}
            </p>
          </div>
          <button
            className="rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground"
            onClick={() => setEditing((value) => !value)}
          >
            ✏ Editar cliente
          </button>
        </div>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: CalendarDays,
            label: "Eventos activos",
            value: customer.activeEvents,
            action: () => scrollTo("customer-events"),
          },
          {
            icon: Archive,
            label: "Eventos archivados",
            value: customer.archivedEvents,
            action: () => scrollTo("customer-events"),
          },
          {
            icon: ReceiptText,
            label: "Ingresos totales",
            value: customer.totalRevenue.toLocaleString("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }),
            action: () => openEventCenter("profitability"),
          },
          {
            icon: Landmark,
            label: "Total recibido",
            value: customer.totalReceived.toLocaleString("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }),
            action: () => openEventCenter("payments"),
          },
          {
            icon: ReceiptText,
            label: "Cuentas por cobrar",
            value: customer.accountsReceivable.toLocaleString("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }),
            action: () => openEventCenter("payments"),
          },
          {
            icon: Landmark,
            label: "Lifetime Value",
            value: customer.lifetimeValue.toLocaleString("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }),
            action: () => scrollTo("customer-commercial-history"),
          },
          {
            icon: FileSignature,
            label: "Contratos",
            value: customer.contracts,
            action: () => openEventCenter("contracts"),
          },
          {
            icon: CalendarDays,
            label: "Cancelados",
            value: customer.cancelledEvents,
            action: () => scrollTo("customer-events"),
          },
        ].map((item) => (
          <button className="group rounded-2xl border bg-card p-4 text-left transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" key={item.label} onClick={item.action} type="button">
            <item.icon className="size-4 text-muted" />
            <p className="mt-4 text-2xl font-semibold">{item.value}</p>
            <p className="text-sm text-muted">{item.label}</p>
            <p className="mt-3 text-xs font-semibold text-brand">Gestionar</p>
          </button>
        ))}
      </section>
      {editing && (
        <form
          action={submit}
          className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2"
          id="customer-general-information"
        >
          {[
            ["fullName", "Nombre y Apellido", customer.fullName],
            ["rut", "RUT", customer.rut],
            ["company", "Empresa", customer.company],
            ["phone", "Teléfono", customer.phone],
            ["email", "Email", customer.email],
            ["address", "Dirección", customer.address],
          ].map(([name, label, value]) => (
            <label className="text-sm" key={name}>
              <span className="mb-1.5 block text-muted">{label}</span>
              <input
                className="h-11 w-full rounded-xl border bg-background px-3"
                defaultValue={value}
                name={name}
              />
            </label>
          ))}
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block text-muted">
              Contactos adicionales (Nombre | Email | Teléfono)
            </span>
            <textarea
              className="min-h-24 w-full rounded-xl border bg-background p-3"
              defaultValue={customer.contacts
                .map((contact) =>
                  [contact.name, contact.email, contact.phone].join(" | "),
                )
                .join("\n")}
              name="contacts"
              placeholder="Producción | produccion@empresa.cl | +56 9 1234 5678"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block text-muted">Notas comerciales</span>
            <textarea
              className="min-h-24 w-full rounded-xl border bg-background p-3"
              defaultValue={customer.commercialNotes}
              name="commercialNotes"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block text-muted">Motivo del cambio</span>
            <input
              className="h-11 w-full rounded-xl border bg-background px-3"
              name="reason"
              required
            />
          </label>
          {error && (
            <p className="text-sm text-red-400 sm:col-span-2">{error}</p>
          )}
          <button
            className="rounded-xl bg-primary px-4 py-2.5 text-primary-foreground sm:col-span-2"
            disabled={pending}
          >
            <Save className="mr-2 inline size-4" />
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>
      )}
      {editingEvent && (
        <form
          action={submitEvent}
          className="grid gap-4 rounded-2xl border border-brand/30 bg-card p-5 sm:grid-cols-2"
          ref={eventEditorRef}
        >
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
              Editar Evento
            </p>
            <h2 className="mt-1 text-xl font-semibold">{editingEvent.name}</h2>
          </div>
          {[
            ["date", "Fecha", editingEvent.date ?? "", "date"],
            ["time", "Hora", editingEvent.time?.slice(0, 5) ?? "", "time"],
            ["type", "Tipo", editingEvent.type, "text"],
            ["location", "Lugar", editingEvent.location ?? "", "text"],
            [
              "eventAddress",
              "Dirección del Evento",
              editingEvent.eventAddress ?? "",
              "text",
            ],
            ["municipality", "Comuna", editingEvent.municipality ?? "", "text"],
            ["service", "Servicio", editingEvent.service, "text"],
            [
              "duration",
              "Duración",
              editingEvent.duration?.toString() ?? "",
              "number",
            ],
            [
              "boothQuantity",
              "Cantidad de cabinas",
              (editingEvent.boothQuantity ?? 1).toString(),
              "number",
            ],
            [
              "transport",
              "Transporte",
              editingEvent.transport.toString(),
              "number",
            ],
            ["extras", "Extras (separados por coma)", (editingEvent.extras ?? []).join(", "), "text"],
            ["appliedPrice", "Precio aplicado total", (editingEvent.appliedPrice ?? 0).toString(), "number"],
          ].map(([name, label, value, type]) => (
            <label className="text-sm" key={name}>
              <span className="mb-1.5 block text-muted">{label}</span>
              <input
                className="h-11 w-full rounded-xl border bg-background px-3"
                defaultValue={value}
                min={name === "boothQuantity" ? 1 : undefined}
                name={name}
                type={type}
              />
            </label>
          ))}
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block text-muted">Motivo del cambio</span>
            <input
              className="h-11 w-full rounded-xl border bg-background px-3"
              name="reason"
              required
            />
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button
              className="rounded-xl border px-4 py-2.5"
              onClick={() => setEditingEvent(null)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="rounded-xl bg-primary px-4 py-2.5 text-primary-foreground"
              disabled={pending}
            >
              Guardar y sincronizar
            </button>
          </div>
        </form>
      )}
      <section className="scroll-mt-24" id="customer-events">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Todos los eventos</h2><p className="text-sm text-muted">Las reservas nuevas se crean desde el flujo único de Nueva Reserva y luego se administran completamente aquí.</p></div>
        <div className="mt-3 space-y-3">
          {customer.events.map((event) => (
            <article
              className="rounded-2xl border bg-card p-4"
              key={event.projectId}
            >
              <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">
                  {event.type} · {event.name}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {event.date
                    ? new Date(`${event.date}T12:00:00Z`).toLocaleDateString(
                        "es-CL",
                      )
                    : "Sin fecha"}{" "}
                  · {event.location || "Lugar por confirmar"} ·{" "}
                  {event.municipality || "Sin comuna"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2.5 py-1 text-xs">
                  {event.status}
                </span>
                <details className="relative">
                  <summary
                    aria-label={`Acciones para ${event.name}`}
                    className="grid size-10 cursor-pointer list-none place-items-center rounded-xl border"
                  >
                    <MoreVertical className="size-4" />
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border bg-card p-2 shadow-xl">
                    <button
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent"
                      onClick={() =>
                        setManagedEvent((current) =>
                          current === event.projectId ? null : event.projectId,
                        )
                      }
                      type="button"
                    >
                      <ExternalLink className="size-4" />
                      {managedEvent === event.projectId
                        ? "Cerrar Evento"
                        : "Abrir Evento"}
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => beginEventEdit(event)}
                    >
                      <Save className="size-4" />
                      Editar Evento
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => duplicateEvent(event)}
                    >
                      <Copy className="size-4" />
                      Duplicar Evento
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => runLifecycle(event, "ARCHIVE")}
                    >
                      <Archive className="size-4" />
                      Archivar Evento
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                      onClick={() => runLifecycle(event, "PERMANENT_DELETE")}
                    >
                      <Trash2 className="size-4" />
                      Eliminar Evento
                    </button>
                  </div>
                </details>
              </div>
              </div>
              {managedEvent === event.projectId && (
                <CustomerEventOperations
                  event={event}
                  onEditEvent={() => beginEventEdit(event)}
                  operations={operations.find(
                    (item) => item.projectId === event.projectId,
                  )}
                />
              )}
            </article>
          ))}
          {customer.events.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-muted">
              Sin Eventos.
            </p>
          )}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Centro del Cliente</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Información general", `${customer.phone || "Sin teléfono"} · ${customer.email || "Sin email"}`, () => setEditing(true)],
            ["Eventos", `${customer.activeEvents} activos · ${customer.archivedEvents} archivados · ${customer.cancelledEvents} cancelados`, () => scrollTo("customer-events")],
            ["Pagos", `${customer.payments} movimientos registrados`, () => openEventCenter("payments")],
            ["Contratos", customer.contracts ? `${customer.contracts} documentos` : "Sin contratos registrados", () => openEventCenter("contracts")],
            ["Documentos", customer.documents ? `${customer.documents} archivos` : "Sin documentos registrados", () => openEventCenter("documents")],
            ["Historial comercial", customer.commercialHistory.length ? `${customer.commercialHistory.length} registros cronológicos` : "Sin historial comercial", () => scrollTo("customer-commercial-history")],
            ["Rentabilidad", customer.profitabilityRecords ? `${customer.profitabilityRecords} cálculos disponibles` : "Sin rentabilidad registrada", () => openEventCenter("profitability")],
          ].map(([title, detail, action]) => <button className="group rounded-2xl border bg-card p-4 text-left transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" key={String(title)} onClick={action as () => void} type="button"><span className="flex items-center justify-between gap-3"><span className="font-semibold">{String(title)}</span><ExternalLink className="size-4 text-muted transition group-hover:text-brand"/></span><span className="mt-2 block text-sm text-muted">{String(detail)}</span><span className="mt-4 block text-xs font-semibold text-brand">Abrir centro</span></button>)}
        </div>
      </section>
      <section className="scroll-mt-24" id="customer-commercial-history">
        <h2 className="text-lg font-semibold">
          Historial comercial completo
        </h2>
        <div className="mt-3 space-y-3">
          {customer.commercialHistory.map((item) => (
            <button
              className="block w-full rounded-2xl border bg-card p-4 text-left hover:border-primary/50"
              onClick={() => {
                setManagedEvent(item.projectId);
                setPendingSection(`documents-${item.projectId}`);
              }}
              key={item.id}
              type="button"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.type} · {item.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(item.date).toLocaleString("es-CL")}
                  </p>
                </div>
                <span className="rounded-full border px-2.5 py-1 text-xs">{item.type}</span>
              </div>
              <p className="mt-3 text-sm text-muted">{item.detail}</p>
              <span className="mt-4 block text-xs font-semibold text-brand">Abrir gestión de este Evento</span>
            </button>
          ))}
          {customer.commercialHistory.length === 0 && (
            <p className="rounded-2xl border border-dashed p-6 text-sm text-muted">
              Sin historial comercial registrado.
            </p>
          )}
        </div>
      </section>
      <section>
        <div>
          <h2 className="text-lg font-semibold">Timeline comercial</h2>
          <div className="mt-3 max-h-96 space-y-3 overflow-auto rounded-2xl border bg-card p-5">
            {customer.timeline.map((item) => (
              <div className="border-l-2 pl-3" key={item.id}>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-muted">{item.message}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {new Date(item.date).toLocaleString("es-CL")}
                </p>
              </div>
            ))}
            {customer.timeline.length === 0 && (
              <p className="text-sm text-muted">Sin actividad registrada.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function parseContacts(value: string) {
  return value
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.some(Boolean))
    .map(([name = "", email = "", phone = ""]) => ({ name, email, phone }));
}

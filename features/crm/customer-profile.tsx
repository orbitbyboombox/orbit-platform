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
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomerProfile, CrmEventSummary } from "./types";
import {
  duplicateCrmEventAction,
  transitionCrmEventAction,
  updateCrmCustomerAction,
  updateCrmEventAction,
} from "./actions";
export function CustomerProfile({
  customer,
}: {
  customer: CrmCustomerProfile;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CrmEventSummary | null>(
    null,
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
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
        municipality: String(form.get("municipality")),
        service: String(form.get("service")),
        duration: String(form.get("duration")),
        transport: String(form.get("transport")),
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
          },
          {
            icon: Archive,
            label: "Eventos archivados",
            value: customer.archivedEvents,
          },
          {
            icon: ReceiptText,
            label: "Ingresos totales",
            value: customer.totalRevenue.toLocaleString("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }),
          },
          {
            icon: Landmark,
            label: "Total recibido",
            value: customer.totalReceived.toLocaleString("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }),
          },
          {
            icon: ReceiptText,
            label: "Cuentas por cobrar",
            value: customer.accountsReceivable.toLocaleString("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }),
          },
          {
            icon: Landmark,
            label: "Lifetime Value",
            value: customer.lifetimeValue.toLocaleString("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }),
          },
          {
            icon: FileSignature,
            label: "Contratos",
            value: customer.contracts,
          },
          {
            icon: CalendarDays,
            label: "Cancelados",
            value: customer.cancelledEvents,
          },
        ].map((item) => (
          <div className="rounded-2xl border bg-card p-4" key={item.label}>
            <item.icon className="size-4 text-muted" />
            <p className="mt-4 text-2xl font-semibold">{item.value}</p>
            <p className="text-sm text-muted">{item.label}</p>
          </div>
        ))}
      </section>
      {editing && (
        <form
          action={submit}
          className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2"
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
            ["municipality", "Comuna", editingEvent.municipality ?? "", "text"],
            ["service", "Servicio", editingEvent.service, "text"],
            [
              "duration",
              "Duración",
              editingEvent.duration?.toString() ?? "",
              "number",
            ],
            [
              "transport",
              "Transporte",
              editingEvent.transport.toString(),
              "number",
            ],
          ].map(([name, label, value, type]) => (
            <label className="text-sm" key={name}>
              <span className="mb-1.5 block text-muted">{label}</span>
              <input
                className="h-11 w-full rounded-xl border bg-background px-3"
                defaultValue={value}
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
      <section>
        <h2 className="text-lg font-semibold">Todos los eventos</h2>
        <div className="mt-3 space-y-3">
          {customer.events.map((event) => (
            <article
              className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4"
              key={event.projectId}
            >
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
                    <Link
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent"
                      href={`/projects/${event.projectId}`}
                    >
                      <ExternalLink className="size-4" />
                      Abrir Evento
                    </Link>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => setEditingEvent(event)}
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
            </article>
          ))}
          {customer.events.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-muted">
              Sin Eventos.
            </p>
          )}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted">
          {customer.contracts
            ? `${customer.contracts} contrato${customer.contracts === 1 ? "" : "s"} registrado${customer.contracts === 1 ? "" : "s"}.`
            : "Sin contratos registrados."}
        </p>
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted">
          {customer.invoices
            ? `${customer.invoices} factura${customer.invoices === 1 ? "" : "s"} registrada${customer.invoices === 1 ? "" : "s"}.`
            : "Sin facturas registradas."}
        </p>
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted">
          {customer.portalActive ? "Portal activo." : "Sin Portal activo."}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Centro del Cliente</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Información general", `${customer.phone || "Sin teléfono"} · ${customer.email || "Sin email"}`],
            ["Eventos", `${customer.activeEvents} activos · ${customer.archivedEvents} archivados · ${customer.cancelledEvents} cancelados`],
            ["Pagos", `${customer.payments} movimientos registrados`],
            ["Contratos", customer.contracts ? `${customer.contracts} documentos` : "Sin contratos registrados"],
            ["Documentos", customer.documents ? `${customer.documents} archivos` : "Sin documentos registrados"],
            ["Historial comercial", customer.negotiations.length ? `${customer.negotiations.length} decisiones registradas` : "Sin historial comercial"],
            ["Rentabilidad", customer.profitabilityRecords ? `${customer.profitabilityRecords} cálculos disponibles` : "Sin rentabilidad registrada"],
          ].map(([title,detail])=><article className="rounded-2xl border bg-card p-4" key={title}><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-muted">{detail}</p></article>)}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold">
          Historial de precios aplicados
        </h2>
        <div className="mt-3 space-y-3">
          {customer.negotiations.map((item) => (
            <Link
              className="block rounded-2xl border bg-card p-4 hover:border-primary/50"
              href={`/projects/${item.projectId}`}
              key={item.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {item.orbitEventId} · {item.reason}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {item.user} ·{" "}
                    {new Date(item.timestamp).toLocaleString("es-CL")}
                  </p>
                </div>
                <span className="rounded-full border px-2.5 py-1 text-xs">
                  {item.difference >= 0 ? "+" : ""}
                  {item.differencePercentage.toFixed(1)}%
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted">Precio oficial</dt>
                  <dd className="font-semibold">
                    {item.officialPrice.toLocaleString("es-CL", {
                      style: "currency",
                      currency: "CLP",
                      maximumFractionDigits: 0,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Precio aplicado</dt>
                  <dd className="font-semibold text-brand">
                    {item.negotiatedPrice.toLocaleString("es-CL", {
                      style: "currency",
                      currency: "CLP",
                      maximumFractionDigits: 0,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Diferencia</dt>
                  <dd className="font-semibold">
                    {item.difference >= 0 ? "+" : ""}
                    {item.difference.toLocaleString("es-CL", {
                      style: "currency",
                      currency: "CLP",
                      maximumFractionDigits: 0,
                    })}
                  </dd>
                </div>
              </dl>
            </Link>
          ))}
          {customer.negotiations.length === 0 && (
            <p className="rounded-2xl border border-dashed p-6 text-sm text-muted">
              Sin precios aplicados por reserva registrados.
            </p>
          )}
        </div>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Información y Portal</h2>
          <div className="mt-3 rounded-2xl border bg-card p-5 text-sm">
            <p>{customer.phone || "Sin teléfono"}</p>
            <p className="mt-2">{customer.email || "Sin email"}</p>
            <p className="mt-2">{customer.address || "Sin dirección"}</p>
            <p className="mt-4 flex items-center gap-2 text-muted">
              <ShieldCheck className="size-4" />
              Portal {customer.portalActive ? "activo" : "sin activar"}
            </p>
            <p className="mt-4 whitespace-pre-wrap text-muted">
              {customer.commercialNotes || "Sin notas comerciales."}
            </p>
          </div>
        </div>
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

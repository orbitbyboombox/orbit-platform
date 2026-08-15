"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cancelStaffAssignmentByFounderAction,
  saveStaffAssignmentAction,
  updateStaffAssignmentStatusAction,
  type StaffAssignmentMutation,
} from "./actions";
import {
  addStaffSettlementAdjustmentAction,
  addStaffSettlementReimbursementAction,
  updateStaffEventSettlementAction,
} from "@/features/staff-payments/actions";
import { reviewStaffRequestAction, setEventStaffRequirementAction } from "@/features/operations/operations-planning.actions";

export type OperationalAssignment = {
  id: string;
  staffId: string;
  staffName: string;
  role: string;
  status: string;
  arrivalTime: string;
  startTime: string;
  finishTime: string;
  vehicleId: string;
  vehicleName: string;
  observations: string;
  packageStatus?: Record<string, string>;
};
export type AssignmentStaffOption = {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
};
export type AssignmentVehicleOption = { id: string; name: string };
export type EventStaffSettlementAdjustment = {
  id: string;
  reason: string;
  amount: number;
  comment: string;
  createdAt: string;
  founder: string;
};
export type EventStaffSettlementReimbursement = {
  id: string;
  category: string;
  description: string;
  amount: number;
  status: string;
  date: string;
};
export type EventStaffSettlementPayment = {
  id: string;
  type: string;
  amount: number;
  date: string;
  method: string;
  notes: string;
  founder: string;
  createdAt: string;
};
export type EventStaffSettlement = {
  id: string;
  staffName: string;
  roles: string[];
  originalOperator: number;
  originalAssembly: number;
  originalDisassembly: number;
  originalNet: number;
  adjustmentTotal: number;
  reimbursementTotal: number;
  finalAmount: number;
  paid: number;
  remaining: number;
  settlementStatus: string;
  paidAt: string;
  receiptStatus: string;
  adjustments: EventStaffSettlementAdjustment[];
  reimbursements: EventStaffSettlementReimbursement[];
  payments: EventStaffSettlementPayment[];
};
export type StaffAssignmentCenterProps = {
  projectId: string;
  assignments: OperationalAssignment[];
  staff: AssignmentStaffOption[];
  vehicles: AssignmentVehicleOption[];
  hasPendingRequest?: boolean;
  published?: boolean;
  settlements?: EventStaffSettlement[];
  requirements?: Array<{ role: string; required: number; published: boolean }>;
  requests?: Array<{ id: string; role: string; staffName: string; status: string }>;
};
const roles = [
  { value: "OPERATOR", label: "Operador" },
  { value: "ASSEMBLY", label: "Montaje" },
  { value: "DISASSEMBLY", label: "Desmontaje" },
];
const roleLabel = (role: string) =>
  roles.find((x) => x.value === role)?.label ?? role;
const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
const adjustmentReason = (value: string) =>
  ({
    BONUS: "Bono",
    EXTRA_HOURS: "Horas extra",
    OPERATIONAL_AGREEMENT: "Acuerdo operacional",
    CUSTOMER_REQUEST: "Solicitud del cliente",
    DIFFERENCE_CORRECTION: "Corrección de diferencia",
    OTHER: "Otro",
  })[value] ?? value;
const statusLabel = (status: string) =>
  ({
    ASSIGNED: "Asignado",
    PENDING: "Pendiente de confirmación",
    PENDING_CONFIRMATION: "Pendiente de confirmación",
    ACCEPTED: "Confirmado",
    CONFIRMED: "Confirmado",
    COMPLETED: "Completado",
    CANCELLED: "Cancelado",
    REJECTED: "Cancelado",
  })[status] ?? status;
const variant = (status: string): "success" | "warning" | "danger" | "info" =>
  ["CONFIRMED", "ACCEPTED", "COMPLETED"].includes(status)
    ? "success"
    : ["CANCELLED", "REJECTED"].includes(status)
      ? "danger"
      : ["PENDING", "PENDING_CONFIRMATION"].includes(status)
        ? "warning"
        : "info";

export function StaffAssignmentCenter({
  projectId,
  assignments,
  staff,
  vehicles,
  hasPendingRequest = false,
  published = false,
  settlements = [],
  requirements = [],
  requests = [],
}: StaffAssignmentCenterProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<{
    mode: "create" | "edit" | "replace";
    item?: OperationalAssignment;
  } | null>(null);
  const [settlement, setSettlement] = useState<EventStaffSettlement | null>(
    null,
  );
  const [cancelling, setCancelling] = useState<OperationalAssignment | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const mutate = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage(result.error ?? "No fue posible actualizar la asignación.");
        return;
      }
      setPanel(null);
      router.refresh();
    });
  };
  const setStatus = (item: OperationalAssignment, status: string) =>
    mutate(() =>
      updateStaffAssignmentStatusAction({ id: item.id, projectId, status }),
    );
  const cancelAssignment = (
    item: OperationalAssignment,
    reasonCategory: string,
    reasonDetail: string,
  ) =>
    startTransition(async () => {
      const result = await cancelStaffAssignmentByFounderAction({
        id: item.id,
        projectId,
        reasonCategory,
        reasonDetail,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setCancelling(null);
      router.refresh();
    });
  const saveSettlement = (
    data: FormData,
    kind: "adjustment" | "reimbursement" | "payment",
  ) =>
    startTransition(async () => {
      const result =
        kind === "adjustment"
          ? await addStaffSettlementAdjustmentAction(data)
          : kind === "reimbursement"
            ? await addStaffSettlementReimbursementAction(data)
            : await updateStaffEventSettlementAction(data);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setSettlement(null);
      router.refresh();
    });
  return (
    <section
      className="scroll-mt-24 rounded-2xl border bg-card p-5 sm:p-6"
      id="staff-assignment"
    >
      <header className="mb-5 flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <UsersRound className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted">
              OPERACIÓN
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Staff y liquidación del Evento
            </h2>
            <p className="mt-1 text-sm text-muted">
              El Evento aprueba responsabilidades y conserva los valores
              oficiales de cada liquidación.
            </p>
          </div>
        </div>
        {!hasPendingRequest ? (
          <Button onClick={() => setPanel({ mode: "create" })}>
            <Plus className="size-4" />
            Asignar Staff
          </Button>
        ) : null}
      </header>
      {message && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-brand/20 bg-brand/10 p-3 text-sm"
        >
          {message}
        </p>
      )}
      <section className="mb-5 grid gap-3 border-b pb-5 lg:grid-cols-3">
        {roles.map((role) => {
          const requirement = requirements.find((item) => item.role === role.value);
          const confirmed = assignments.filter((item) => item.role === role.value && !["CANCELLED", "REJECTED"].includes(item.status)).length;
          const configuredRequired = requirement?.required ?? (role.value === "OPERATOR" ? 1 : 0);
          const required = Math.max(configuredRequired, confirmed);
          const isPublished = requirement?.published ?? (role.value === "OPERATOR" && published);
          return <form action={(data)=>startTransition(async()=>{const result=await setEventStaffRequirementAction(data);setMessage(result.message);if(result.ok)router.refresh()})} className="rounded-xl border p-4" key={role.value}>
            <input name="projectId" type="hidden" value={projectId}/><input name="role" type="hidden" value={role.value}/>
            <div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{role.label}</p><p className="text-sm text-muted">{confirmed}/{required} asignado{required===1?"":"s"}</p></div><StatusBadge label={isPublished?"Publicado":"Interno"} variant={isPublished?"success":"info"}/></div>
            <div className="mt-3 flex items-end gap-2"><label className="grid flex-1 gap-1 text-xs text-muted">Cantidad requerida<input className="min-h-10 rounded-lg border bg-background px-3 text-foreground" defaultValue={required} min="0" name="quantity" type="number"/></label><label className="flex min-h-10 items-center gap-2 text-sm"><input defaultChecked={isPublished} name="published" type="checkbox" value="true"/>Publicar</label><Button disabled={pending} type="submit">Guardar</Button></div>
          </form>;
        })}
      </section>
      {requests.length ? <section className="mb-5 border-b pb-5"><h3 className="font-semibold">Solicitudes Staff</h3><div className="mt-3 grid gap-3 lg:grid-cols-2">{requests.map((request)=><article className="rounded-xl border p-4" key={request.id}><p className="font-semibold">{request.staffName}</p><p className="mt-1 text-sm text-muted">{roleLabel(request.role)} · Solicitud pendiente</p><div className="mt-3 flex gap-2"><form action={(data)=>startTransition(async()=>{const result=await reviewStaffRequestAction(data);setMessage(result.message);if(result.ok)router.refresh()})}><input name="requestId" type="hidden" value={request.id}/><input name="decision" type="hidden" value="approve"/><Button disabled={pending} type="submit">Aprobar</Button></form><form action={(data)=>startTransition(async()=>{const result=await reviewStaffRequestAction(data);setMessage(result.message);if(result.ok)router.refresh()})}><input name="requestId" type="hidden" value={request.id}/><input name="decision" type="hidden" value="reject"/><Button disabled={pending} type="submit" variant="outline">Rechazar</Button></form></div></article>)}</div></section>:null}
      <div className="grid gap-3 lg:grid-cols-2">
        {assignments.map((item) => (
          <article className="rounded-xl border p-4" key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.staffName}</p>
                <p className="mt-1 text-sm text-muted">
                  {roleLabel(item.role)} · {item.vehicleName || "Sin vehículo"}
                </p>
              </div>
              <StatusBadge
                label={statusLabel(item.status)}
                variant={variant(item.status)}
              />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <Time label="Llegada" value={item.arrivalTime} />
              <Time label="Inicio" value={item.startTime} />
              <Time label="Término" value={item.finishTime} />
            </dl>
            {item.packageStatus ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Time label="Portal" value={item.packageStatus.portal === "ACCEPTED" ? "Aceptado" : item.packageStatus.portal || "Pendiente"} />
                <Time label="Email" value={item.packageStatus.email === "SENT" ? "Enviado" : item.packageStatus.email || "Pendiente"} />
                <Time label="Calendario" value={item.packageStatus.calendar === "SENT" ? "Enviado" : item.packageStatus.calendar || "Pendiente"} />
                <Time label="Checklist" value={item.packageStatus.checklist === "PENDING" ? "Pendiente" : item.packageStatus.checklist || "Pendiente"} />
              </dl>
            ) : null}
            {item.observations && (
              <p className="mt-3 rounded-lg bg-background/50 p-3 text-sm text-muted">
                {item.observations}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <Small
                label="Editar"
                icon={<Pencil />}
                onClick={() => setPanel({ mode: "edit", item })}
              />
              <Small
                label="Reemplazar"
                icon={<RefreshCw />}
                onClick={() => setPanel({ mode: "replace", item })}
              />
              {item.status === "ASSIGNED" && (
                <Small
                  label="Solicitar confirmación"
                  icon={<Clock3 />}
                  onClick={() => setStatus(item, "PENDING_CONFIRMATION")}
                />
              )}{" "}
              {["PENDING", "PENDING_CONFIRMATION"].includes(item.status) && (
                <Small
                  label="Confirmar"
                  icon={<CheckCircle2 />}
                  onClick={() => setStatus(item, "CONFIRMED")}
                />
              )}{" "}
              {["CONFIRMED", "ACCEPTED"].includes(item.status) && (
                <Small
                  label="Completar"
                  icon={<CheckCircle2 />}
                  onClick={() => setStatus(item, "COMPLETED")}
                />
              )}{" "}
              {!["COMPLETED", "CANCELLED", "REJECTED"].includes(
                item.status,
              ) && (
                <Small
                  danger
                  label="Cancelar asignación"
                  icon={<Trash2 />}
                  onClick={() => setCancelling(item)}
                />
              )}
            </div>
          </article>
        ))}
        {!assignments.length && (
          <div className="rounded-xl border border-dashed p-7 text-center lg:col-span-2">
            <p className="font-semibold">Sin asignaciones confirmadas</p>
            <p className="mt-1 text-sm text-muted">
              {hasPendingRequest
                ? "La solicitud se revisa desde Dashboard o Staff Operations."
                : "Aún no existe una asignación operacional confirmada."}
            </p>
          </div>
        )}
      </div>
      {settlements.length ? (
        <section className="mt-5 border-t pt-5">
          <h3 className="font-semibold">Liquidaciones oficiales del Evento</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {settlements.map((item) => (
              <article className="rounded-xl border p-4" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.staffName}</p>
                    <p className="mt-1 text-sm text-muted">
                      {item.roles.map(roleLabel).join(" + ")}
                    </p>
                  </div>
                  <StatusBadge
                    label={
                      item.settlementStatus === "PAID"
                        ? "Pagado"
                        : item.settlementStatus === "ADVANCE"
                          ? "Anticipo"
                          : "Pendiente"
                    }
                    variant={
                      item.settlementStatus === "PAID"
                        ? "success"
                        : item.settlementStatus === "ADVANCE"
                          ? "info"
                          : "warning"
                    }
                  />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <Money label="Original" value={item.originalNet} />
                  <Money label="Ajustes" value={item.adjustmentTotal} />
                  <Money label="Reembolsos" value={item.reimbursementTotal} />
                  <Money label="Pago final" value={item.finalAmount} />
                  <Money label="Anticipo / pagado" value={item.paid} />
                  <Money label="Saldo" value={item.remaining} />
                </dl>
                <p className="mt-3 text-xs text-muted">
                  Boleta SII:{" "}
                  {item.receiptStatus === "RECEIVED" ? "Recibida" : "Pendiente"}
                </p>
                <button
                  className="mt-3 text-xs font-semibold text-brand"
                  onClick={() => setSettlement(item)}
                >
                  Gestionar cierre financiero
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {panel && (
        <AssignmentDialog
          mode={panel.mode}
          item={panel.item}
          projectId={projectId}
          staff={staff}
          vehicles={vehicles}
          pending={pending}
          error={message}
          onClose={() => setPanel(null)}
          onSubmit={(input) => mutate(() => saveStaffAssignmentAction(input))}
        />
      )}{" "}
      {settlement && (
        <SettlementDetailDialog
          item={settlement}
          pending={pending}
          onClose={() => setSettlement(null)}
          onSubmit={saveSettlement}
        />
      )}
      {cancelling ? (
        <AssignmentCancellationDialog
          item={cancelling}
          pending={pending}
          onClose={() => setCancelling(null)}
          onSubmit={(reasonCategory, reasonDetail) =>
            cancelAssignment(cancelling, reasonCategory, reasonDetail)
          }
        />
      ) : null}
    </section>
  );
}

void SettlementDialog;

function AssignmentCancellationDialog({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item: OperationalAssignment;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reasonCategory: string, reasonDetail: string) => void;
}) {
  const [reasonCategory, setReasonCategory] = useState("OPERATIONAL"),
    [reasonDetail, setReasonDetail] = useState("");
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
      role="dialog"
    >
      <section className="w-full max-w-lg rounded-t-2xl border bg-card p-5 sm:rounded-2xl sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-danger">
              Cancelación operacional
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              Cancelar asignación de {item.staffName}
            </h3>
            <p className="mt-2 text-sm text-muted">
              Staff recibirá una alerta y un email. El Evento volverá a estar
              disponible para cobertura.
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className="rounded-lg border p-2"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>
        <label className="mt-5 grid gap-2 text-sm font-medium">
          Motivo
          <select
            className="min-h-11 rounded-xl border bg-background px-3"
            value={reasonCategory}
            onChange={(event) => setReasonCategory(event.target.value)}
          >
            <option value="OPERATIONAL">Decisión operacional</option>
            <option value="ILLNESS">Enfermedad</option>
            <option value="EMERGENCY">Emergencia</option>
            <option value="FAMILY">Familiar</option>
            <option value="VEHICLE">Vehículo</option>
            <option value="OTHER">Otro</option>
          </select>
        </label>
        <label className="mt-4 grid gap-2 text-sm font-medium">
          Detalle
          <textarea
            className="min-h-24 rounded-xl border bg-background p-3"
            placeholder="Explica el motivo para el historial operacional"
            required={reasonCategory === "OTHER"}
            value={reasonDetail}
            onChange={(event) => setReasonDetail(event.target.value)}
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button disabled={pending} onClick={onClose} variant="outline">
            Volver
          </Button>
          <Button
            disabled={
              pending || (reasonCategory === "OTHER" && !reasonDetail.trim())
            }
            onClick={() => onSubmit(reasonCategory, reasonDetail)}
          >
            {pending ? "Cancelando…" : "Confirmar cancelación"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function SettlementDetailDialog({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item: EventStaffSettlement;
  pending: boolean;
  onClose: () => void;
  onSubmit: (
    data: FormData,
    kind: "adjustment" | "reimbursement" | "payment",
  ) => void;
}) {
  const movementLabel = (value: string) =>
    ({
      ADVANCE: "Anticipo",
      PAYMENT: "Pago",
      REVERSAL: "Reversa / corrección",
    })[value] ?? value;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 sm:max-w-3xl sm:rounded-2xl sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-brand">
              LIQUIDACIÓN DEL EVENTO
            </p>
            <h3 className="mt-1 text-xl font-semibold">{item.staffName}</h3>
            <p className="mt-1 text-sm text-muted">
              Composición y trazabilidad completa del pago, sin salir del
              Evento.
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className="rounded-lg border p-2"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>
        <details className="mt-6 rounded-xl border p-4" open>
          <summary className="cursor-pointer font-semibold">
            LIQUIDACIÓN ORIGINAL · {money(item.originalNet)}
          </summary>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Money label="Operador" value={item.originalOperator} />
            <Money label="Montaje" value={item.originalAssembly} />
            <Money label="Desmontaje" value={item.originalDisassembly} />
            <Money label="Neto original" value={item.originalNet} />
          </dl>
          <p className="mt-3 text-xs text-muted">
            Valor generado por las responsabilidades confirmadas del Evento.
            Solo lectura.
          </p>
        </details>
        <details className="mt-4 rounded-xl border p-4" open>
          <summary className="cursor-pointer font-semibold">
            AJUSTES MANUALES · {money(item.adjustmentTotal)}
          </summary>
          <div className="mt-4 space-y-3">
            {item.adjustments.map((adjustment) => (
              <article
                className="rounded-lg bg-background/50 p-3 text-sm"
                key={adjustment.id}
              >
                <div className="flex justify-between gap-3">
                  <strong>{adjustmentReason(adjustment.reason)}</strong>
                  <strong
                    className={
                      adjustment.amount < 0
                        ? "text-red-500"
                        : "text-emerald-500"
                    }
                  >
                    {adjustment.amount > 0 ? "+" : ""}
                    {money(adjustment.amount)}
                  </strong>
                </div>
                <p className="mt-2 text-muted">{adjustment.comment}</p>
                <p className="mt-2 text-xs text-muted">
                  Founder: {adjustment.founder} ·{" "}
                  {new Date(adjustment.createdAt).toLocaleDateString("es-CL")} ·{" "}
                  {new Date(adjustment.createdAt).toLocaleTimeString("es-CL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </article>
            ))}
            {!item.adjustments.length ? (
              <p className="text-sm text-muted">Sin ajustes manuales.</p>
            ) : null}
          </div>
          <p className="mt-4 border-t pt-3 text-right text-sm font-semibold">
            Total ajustes: {money(item.adjustmentTotal)}
          </p>
          <form
            action={(data) => onSubmit(data, "adjustment")}
            className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2"
          >
            <input name="paymentId" type="hidden" value={item.id} />
            <Select
              label="Motivo"
              name="adjustmentReason"
              value="BONUS"
              options={[
                { value: "BONUS", label: "Bono" },
                { value: "EXTRA_HOURS", label: "Horas extra" },
                {
                  value: "OPERATIONAL_AGREEMENT",
                  label: "Acuerdo operacional",
                },
                { value: "CUSTOMER_REQUEST", label: "Solicitud del cliente" },
                {
                  value: "DIFFERENCE_CORRECTION",
                  label: "Corrección de diferencia",
                },
                { value: "OTHER", label: "Otro" },
              ]}
            />
            <Select
              label="Tipo"
              name="adjustmentDirection"
              value="POSITIVE"
              options={[
                { value: "POSITIVE", label: "Positivo (+)" },
                { value: "NEGATIVE", label: "Negativo (-)" },
              ]}
            />
            <Field
              defaultValue=""
              label="Monto"
              name="adjustmentAmount"
              type="number"
            />
            <Field
              defaultValue=""
              label="Comentario"
              name="adjustmentComment"
            />
            <Button
              className="sm:col-span-2"
              disabled={pending}
              variant="outline"
            >
              Agregar ajuste
            </Button>
          </form>
        </details>
        <details className="mt-4 rounded-xl border p-4" open>
          <summary className="cursor-pointer font-semibold">
            REEMBOLSOS OPERACIONALES · {money(item.reimbursementTotal)}
          </summary>
          <div className="mt-4 space-y-3">
            {item.reimbursements.map((reimbursement) => (
              <article
                className="flex items-center justify-between gap-3 rounded-lg bg-background/50 p-3 text-sm"
                key={reimbursement.id}
              >
                <div>
                  <strong>{reimbursement.description}</strong>
                  <p className="mt-1 text-xs text-muted">
                    {reimbursement.date} ·{" "}
                    {reimbursement.status === "PAID" ? "Pagado" : "Pendiente"}
                  </p>
                </div>
                <strong>{money(reimbursement.amount)}</strong>
              </article>
            ))}
            {!item.reimbursements.length ? (
              <p className="text-sm text-muted">
                Sin reembolsos operacionales.
              </p>
            ) : null}
          </div>
          <p className="mt-4 border-t pt-3 text-right text-sm font-semibold">
            Total reembolsos: {money(item.reimbursementTotal)}
          </p>
          <form
            action={(data) => onSubmit(data, "reimbursement")}
            className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2"
          >
            <input name="paymentId" type="hidden" value={item.id} />
            <Select
              label="Categoría"
              name="reimbursementCategory"
              value="FOOD"
              options={[
                { value: "FOOD", label: "Alimentación" },
                { value: "PARKING", label: "Estacionamiento" },
                { value: "FUEL", label: "Combustible" },
                { value: "TOLLS", label: "Peajes" },
                { value: "ACCOMMODATION", label: "Alojamiento" },
                {
                  value: "OPERATIONAL_PURCHASES",
                  label: "Compras operacionales",
                },
                { value: "OTHER", label: "Otro" },
              ]}
            />
            <Field
              defaultValue=""
              label="Descripción"
              name="reimbursementDescription"
            />
            <Field
              defaultValue=""
              label="Monto"
              name="reimbursementAmount"
              type="number"
            />
            <Field
              defaultValue={new Date().toISOString().slice(0, 10)}
              label="Fecha"
              name="reimbursementDate"
              type="date"
            />
            <Select
              label="Estado"
              name="reimbursementStatus"
              value="PENDING"
              options={[
                { value: "PENDING", label: "Pendiente" },
                { value: "PAID", label: "Pagado" },
              ]}
            />
            <Button disabled={pending} variant="outline">
              Agregar reembolso
            </Button>
          </form>
        </details>
        <details className="mt-4 rounded-xl border p-4" open>
          <summary className="cursor-pointer font-semibold">
            PAGOS · {money(item.paid)}
          </summary>
          <div className="mt-4 space-y-3">
            {item.payments.map((payment) => (
              <article
                className="rounded-lg bg-background/50 p-3 text-sm"
                key={payment.id}
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <strong>{movementLabel(payment.type)}</strong>
                    <p className="mt-1 text-xs text-muted">
                      {payment.date} · {payment.method}
                    </p>
                  </div>
                  <strong>
                    {payment.type === "REVERSAL" ? "−" : ""}
                    {money(payment.amount)}
                  </strong>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Founder: {payment.founder}
                  {payment.notes ? ` · ${payment.notes}` : ""}
                </p>
              </article>
            ))}
            {!item.payments.length ? (
              <p className="text-sm text-muted">Sin pagos registrados.</p>
            ) : null}
          </div>
          <p className="mt-4 border-t pt-3 text-right text-sm font-semibold">
            Total pagado: {money(item.paid)}
          </p>
          <form
            action={(data) => onSubmit(data, "payment")}
            className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2"
          >
            <input name="paymentId" type="hidden" value={item.id} />
            <Select
              label="Tipo de movimiento"
              name="movementType"
              value="ADVANCE"
              options={[
                { value: "ADVANCE", label: "Anticipo" },
                { value: "PAYMENT", label: "Pago" },
                { value: "REVERSAL", label: "Reversa / corrección" },
              ]}
            />
            <Field
              defaultValue=""
              label="Monto"
              name="movementAmount"
              type="number"
            />
            <Field
              defaultValue={new Date().toISOString().slice(0, 10)}
              label="Fecha"
              name="paidAt"
              type="date"
            />
            <Field defaultValue="Transferencia" label="Método" name="method" />
            <Field defaultValue="" label="Observación" name="notes" />
            <Select
              label="Boleta SII"
              name="receiptStatus"
              value={item.receiptStatus}
              options={[
                { value: "PENDING", label: "Pendiente" },
                { value: "RECEIVED", label: "Recibida" },
              ]}
            />
            <Button className="sm:col-span-2" disabled={pending}>
              {pending ? "Guardando…" : "Registrar movimiento"}
            </Button>
          </form>
        </details>
        <details
          className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-4"
          open
        >
          <summary className="cursor-pointer font-semibold">
            SALDO PENDIENTE · {money(item.remaining)}
          </summary>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Money label="Liquidación original" value={item.originalNet} />
            <Money label="Ajustes manuales" value={item.adjustmentTotal} />
            <Money label="Reembolsos" value={item.reimbursementTotal} />
            <Money label="Monto final" value={item.finalAmount} />
            <Money label="Pagos registrados" value={item.paid} />
            <Money label="Saldo pendiente" value={item.remaining} />
          </dl>
        </details>
      </div>
    </div>
  );
}

function SettlementDialog({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item: EventStaffSettlement;
  pending: boolean;
  onClose: () => void;
  onSubmit: (
    data: FormData,
    kind: "adjustment" | "reimbursement" | "payment",
  ) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 sm:max-w-2xl sm:rounded-2xl sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-brand">
              LIQUIDACIÓN DEL EVENTO
            </p>
            <h3 className="mt-1 text-xl font-semibold">{item.staffName}</h3>
            <p className="mt-1 text-sm text-muted">
              El valor original es inmutable. Toda diferencia queda registrada
              como ajuste.
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className="rounded-lg border p-2"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <section className="mt-6 rounded-xl border p-4">
          <h4 className="font-semibold">Liquidación original</h4>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Money label="Operador" value={item.originalOperator} />
            <Money label="Montaje" value={item.originalAssembly} />
            <Money label="Desmontaje" value={item.originalDisassembly} />
            <Money label="Neto original" value={item.originalNet} />
          </dl>
        </section>
        <form
          action={(data) => onSubmit(data, "adjustment")}
          className="mt-4 grid gap-3 rounded-xl border p-4"
        >
          <h4 className="font-semibold">Nuevo ajuste</h4>
          <input name="paymentId" type="hidden" value={item.id} />
          <Select
            label="Motivo"
            name="adjustmentReason"
            value="BONUS"
            options={[
              { value: "BONUS", label: "Bono" },
              { value: "EXTRA_HOURS", label: "Horas extra" },
              { value: "OPERATIONAL_AGREEMENT", label: "Acuerdo operacional" },
              { value: "CUSTOMER_REQUEST", label: "Solicitud del cliente" },
              {
                value: "DIFFERENCE_CORRECTION",
                label: "Corrección de diferencia",
              },
              { value: "OTHER", label: "Otro" },
            ]}
          />
          <Select
            label="Tipo"
            name="adjustmentDirection"
            value="POSITIVE"
            options={[
              { value: "POSITIVE", label: "Positivo (+)" },
              { value: "NEGATIVE", label: "Negativo (-)" },
            ]}
          />
          <Field
            defaultValue=""
            label="Monto"
            name="adjustmentAmount"
            type="number"
          />
          <Field defaultValue="" label="Comentario" name="adjustmentComment" />
          <Button disabled={pending} variant="outline">
            Agregar ajuste
          </Button>
          {item.adjustments.length ? (
            <div className="space-y-2 border-t pt-3">
              {item.adjustments.map((adjustment) => (
                <p className="text-xs text-muted" key={adjustment.id}>
                  <b>{money(adjustment.amount)}</b> ·{" "}
                  {adjustmentReason(adjustment.reason)} · {adjustment.comment}
                  <span className="block">
                    {adjustment.founder} ·{" "}
                    {new Date(adjustment.createdAt).toLocaleString("es-CL")}
                  </span>
                </p>
              ))}
            </div>
          ) : null}
        </form>
        <form
          action={(data) => onSubmit(data, "reimbursement")}
          className="mt-4 grid gap-3 rounded-xl border p-4"
        >
          <h4 className="font-semibold">Nuevo reembolso operacional</h4>
          <input name="paymentId" type="hidden" value={item.id} />
          <Select
            label="Categoría"
            name="reimbursementCategory"
            value="FOOD"
            options={[
              { value: "FOOD", label: "Alimentación" },
              { value: "PARKING", label: "Estacionamiento" },
              { value: "FUEL", label: "Combustible" },
              { value: "TOLLS", label: "Peajes" },
              { value: "ACCOMMODATION", label: "Alojamiento" },
              {
                value: "OPERATIONAL_PURCHASES",
                label: "Compras operacionales",
              },
              { value: "OTHER", label: "Otro" },
            ]}
          />
          <Field
            defaultValue=""
            label="Descripción"
            name="reimbursementDescription"
          />
          <Field
            defaultValue=""
            label="Monto"
            name="reimbursementAmount"
            type="number"
          />
          <Field
            defaultValue={new Date().toISOString().slice(0, 10)}
            label="Fecha"
            name="reimbursementDate"
            type="date"
          />
          <Select
            label="Estado"
            name="reimbursementStatus"
            value="PENDING"
            options={[
              { value: "PENDING", label: "Pendiente" },
              { value: "PAID", label: "Pagado" },
            ]}
          />
          <Button disabled={pending} variant="outline">
            Agregar reembolso
          </Button>
          {item.reimbursements.length ? (
            <div className="space-y-2 border-t pt-3">
              {item.reimbursements.map((reimbursement) => (
                <p className="text-xs text-muted" key={reimbursement.id}>
                  <b>{money(reimbursement.amount)}</b> ·{" "}
                  {reimbursement.description} ·{" "}
                  {reimbursement.status === "PAID" ? "Pagado" : "Pendiente"}
                </p>
              ))}
            </div>
          ) : null}
        </form>
        <section className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
          <h4 className="font-semibold">Cierre final</h4>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Money label="Original" value={item.originalNet} />
            <Money label="Ajustes" value={item.adjustmentTotal} />
            <Money label="Reembolsos" value={item.reimbursementTotal} />
            <Money label="Monto final" value={item.finalAmount} />
            <Money label="Ya pagado" value={item.paid} />
            <Money label="Saldo" value={item.remaining} />
          </dl>
        </section>
        <form
          action={(data) => onSubmit(data, "payment")}
          className="mt-4 grid gap-3 rounded-xl border p-4"
        >
          <input name="paymentId" type="hidden" value={item.id} />
          <Select
            label="Tipo de movimiento"
            name="movementType"
            value="ADVANCE"
            options={[
              { value: "ADVANCE", label: "Anticipo" },
              { value: "PAYMENT", label: "Pago" },
              { value: "REVERSAL", label: "Reversa / corrección" },
            ]}
          />
          <Field
            defaultValue=""
            label="Nuevo movimiento"
            name="movementAmount"
            type="number"
          />
          <Field
            defaultValue={new Date().toISOString().slice(0, 10)}
            label="Fecha del movimiento"
            name="paidAt"
            type="date"
          />
          <Field defaultValue="Transferencia" label="Método" name="method" />
          <Field defaultValue="" label="Observación" name="notes" />
          <Select
            label="Boleta SII"
            name="receiptStatus"
            value={item.receiptStatus}
            options={[
              { value: "PENDING", label: "Pendiente" },
              { value: "RECEIVED", label: "Recibida" },
            ]}
          />
          <Button disabled={pending}>
            {pending ? "Guardando…" : "Registrar movimiento"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function AssignmentDialog({
  mode,
  item,
  projectId,
  staff,
  vehicles,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit" | "replace";
  item?: OperationalAssignment;
  projectId: string;
  staff: AssignmentStaffOption[];
  vehicles: AssignmentVehicleOption[];
  pending: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: StaffAssignmentMutation) => void;
}) {
  const [role, setRole] = useState(item?.role ?? "OPERATOR");
  const compatible = staff.filter((member) =>
    member.capabilities.includes(role),
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 sm:max-w-2xl sm:rounded-2xl sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-brand">
              STAFF · EVENT 360°
            </p>
            <h3 className="mt-1 text-2xl font-semibold">
              {mode === "replace"
                ? "Reemplazar Staff"
                : mode === "edit"
                  ? "Editar asignación"
                  : "Asignar responsabilidad"}
            </h3>
            <p className="mt-2 text-sm text-muted">
              Solo Operador, Montaje y Desmontaje. La llegada del Operador se
              calcula 90 minutos antes del inicio real.
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className="rounded-lg border p-2"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <form
          className="mt-6 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            onSubmit({
              id: mode === "edit" ? item?.id : undefined,
              replaceId: mode === "replace" ? item?.id : undefined,
              projectId,
              staffId: String(data.get("staffId") ?? ""),
              role: String(data.get("role") ?? ""),
              arrivalTime: String(data.get("arrivalTime") ?? ""),
              startTime: String(data.get("startTime") ?? ""),
              finishTime: String(data.get("finishTime") ?? ""),
              vehicleId: String(data.get("vehicleId") ?? ""),
              observations: String(data.get("observations") ?? ""),
            });
          }}
        >
          <Select
            label="Responsabilidad"
            name="role"
            value={role}
            onChange={setRole}
            options={roles}
          />
          <Select
            label="Staff compatible"
            name="staffId"
            value={mode === "edit" ? (item?.staffId ?? "") : ""}
            options={[
              {
                value: "",
                label: compatible.length
                  ? "Seleccionar Staff"
                  : "Sin Staff con esta habilidad",
              },
              ...compatible.map((x) => ({ value: x.id, label: x.name })),
            ]}
          />
          <Field
            label={
              role === "OPERATOR"
                ? "Llegada (automática si se deja vacía)"
                : "Hora de llegada · manual"
            }
            name="arrivalTime"
            type="time"
            defaultValue={item?.arrivalTime}
          />
          <Field
            label="Hora de inicio (desde Evento si queda vacía)"
            name="startTime"
            type="time"
            defaultValue={item?.startTime}
          />
          <Field
            label="Hora de término (desde Evento si queda vacía)"
            name="finishTime"
            type="time"
            defaultValue={item?.finishTime}
          />
          <Select
            label="Vehículo"
            name="vehicleId"
            value={item?.vehicleId ?? ""}
            options={[
              { value: "", label: "Sin vehículo" },
              ...vehicles.map((x) => ({ value: x.id, label: x.name })),
            ]}
          />
          <label className="text-sm font-medium sm:col-span-2">
            Observaciones
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3"
              defaultValue={item?.observations}
              name="observations"
            />
          </label>
          {error && (
            <p className="text-sm text-red-600 sm:col-span-2">{error}</p>
          )}
          <Button
            className="sm:col-span-2"
            disabled={pending || !compatible.length}
          >
            {pending
              ? "Guardando..."
              : mode === "replace"
                ? "Confirmar reemplazo"
                : "Guardar responsabilidad"}
          </Button>
        </form>
      </div>
    </div>
  );
}
function Time({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/50 p-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 flex items-center gap-1 font-medium">
        <Clock3 className="size-3" />
        {value || "—"}
      </dd>
    </div>
  );
}
function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background/50 p-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-semibold">{money(value)}</dd>
    </div>
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
        className="mt-2 h-11 w-full rounded-xl border bg-background px-3"
        defaultValue={defaultValue}
        name={name}
        type={type}
      />
    </label>
  );
}
function Select({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange?: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select
        className="mt-2 h-11 w-full rounded-xl border bg-background px-3"
        defaultValue={value}
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
        required={name !== "vehicleId"}
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
function Small({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon: React.ReactElement;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${danger ? "text-red-600" : ""}`}
      disabled={false}
      onClick={onClick}
    >
      {<span className="[&>svg]:size-3.5">{icon}</span>}
      {label}
    </button>
  );
}

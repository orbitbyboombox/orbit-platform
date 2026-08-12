"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Banknote,
  CheckCircle2,
  History,
  RotateCcw,
  Trash2,
  CalendarClock,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  applyReceivableMovementAction,
  updateReceivableDatesAction,
  type ReceivableMovementAction,
} from "./actions";

type Movement = {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  reason: string;
  type: string;
  receiptPath: string | null;
};
export type EventReceivable = {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  outstandingBalance: number;
  status: string;
  dueDate?: string | null;
  movements: Movement[];
};
const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
const labels: Record<ReceivableMovementAction, string> = {
  DEPOSIT: "Registrar Reserva",
  PARTIAL_PAYMENT: "Registrar Pago Parcial",
  FULL_PAYMENT: "Registrar Pago Total",
  RETURN_PENDING: "Volver a Pendiente",
  ARCHIVE: "Archivar Cuenta por Cobrar",
  CANCEL: "Cancelar Cuenta por Cobrar",
  DELETE: "Eliminar Cuenta por Cobrar",
};

export function EventPaymentManager({
  projectId,
  receivable,
}: {
  projectId: string;
  receivable: EventReceivable;
}) {
  const router = useRouter();
  const [action, setAction] = useState<ReceivableMovementAction | null>(null);
  const [feedback, setFeedback] = useState("");
  const [dateEditor, setDateEditor] = useState<{ paymentId?: string; paymentDate?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = (data: FormData) => {
    if (!action) return;
    data.set("invoiceId", receivable.id);
    data.set("projectId", projectId);
    data.set("movementAction", action);
    startTransition(async () => {
      const result = await applyReceivableMovementAction(data);
      if (result.ok) {
        setAction(null);
        setFeedback("Movimiento registrado y saldos sincronizados.");
        router.refresh();
      } else setFeedback(result.error);
    });
  };
  return (
    <section
      className="rounded-2xl border bg-card p-5 sm:p-6"
      id="payment-management"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
            Gestión financiera del Evento
          </p>
          <h2 className="mt-1 text-xl font-semibold">Movimientos de pago</h2>
          <p className="mt-1 text-sm text-muted">{receivable.invoiceNumber}</p>
        </div>
        <StatusBadge
          label={receivable.status}
          variant={
            receivable.status === "PAID"
              ? "success"
              : receivable.status === "CANCELLED"
                ? "neutral"
                : "warning"
          }
        />
      </header>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Metric label="Valor del Evento" value={receivable.amount} />
        <Metric label="Monto recibido" value={receivable.paidAmount} />
        <Metric label="Saldo pendiente" value={receivable.outstandingBalance} />
        <div className="rounded-xl border bg-background/30 p-4">
          <p className="text-xs text-muted">Estado de pago</p>
          <p className="mt-2 font-semibold">
            {receivable.status === "PAID"
              ? "Pagado"
              : receivable.paidAmount > 0
                ? "Pago parcial"
                : "Pendiente"}
          </p>
        </div>
      </div>
      <details className="mt-5 rounded-xl border">
        <summary className="cursor-pointer list-none px-4 py-3 font-medium">
          Gestionar pago
        </summary>
        <div className="grid gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-3">
          {receivable.status !== "CANCELLED" && (
            <>
              <Action
                label="Registrar Reserva"
                icon={<Banknote />}
                onClick={() => setAction("DEPOSIT")}
              />
              <Action
                label="Registrar Pago Parcial"
                icon={<Banknote />}
                onClick={() => setAction("PARTIAL_PAYMENT")}
              />
              <Action
                label="Registrar Pago Total"
                icon={<CheckCircle2 />}
                onClick={() => setAction("FULL_PAYMENT")}
              />
              {receivable.paidAmount > 0 && (
                <Action
                  label="Volver a Pendiente"
                  icon={<RotateCcw />}
                  onClick={() => setAction("RETURN_PENDING")}
                />
              )}
              <Action
                label="Archivar Cuenta"
                icon={<Archive />}
                onClick={() => setAction("ARCHIVE")}
              />
              <Action
                label="Cancelar Cuenta"
                icon={<X />}
                onClick={() => setAction("CANCEL")}
              />
            </>
          )}
          <Action
            label="Editar vencimiento"
            icon={<CalendarClock />}
            onClick={() => setDateEditor({})}
          />
          <Action
            danger
            label="Eliminar Cuenta"
            icon={<Trash2 />}
            onClick={() => setAction("DELETE")}
          />
        </div>
      </details>
      {receivable.movements.length > 0 && (
        <div className="mt-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" />
            Historial de movimientos
          </p>
          <div className="mt-3 space-y-2">
            {receivable.movements.map((item) => (
              <div
                className="flex flex-col justify-between gap-1 rounded-xl border p-3 text-sm sm:flex-row"
                key={item.id}
              >
                <div>
                  <p className="font-medium">
                    {item.type.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(item.paidAt).toLocaleString("es-CL")} ·{" "}
                    {item.method || "Sin método"} · {item.reason}
                  </p>
                </div>
                <strong
                  className={item.amount < 0 ? "text-danger" : "text-success"}
                >
                  {item.amount < 0 ? "−" : "+"}
                  {money(Math.abs(item.amount))}
                </strong>
                <button className="mt-2 inline-flex items-center gap-1 text-xs text-brand sm:mt-0" onClick={() => setDateEditor({ paymentId: item.id, paymentDate: item.paidAt.slice(0, 10) })} type="button"><Pencil className="size-3"/>Editar fecha</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {feedback && (
        <p aria-live="polite" className="mt-4 text-sm text-muted">
          {feedback}
        </p>
      )}
      {action && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 sm:items-center sm:p-6"
          role="dialog"
        >
          <div className="w-full rounded-t-2xl border bg-card p-5 sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  {labels[action]}
                </p>
                <h3 className="mt-1 text-xl font-semibold">
                  {receivable.invoiceNumber}
                </h3>
              </div>
              <button
                aria-label="Cerrar"
                className="rounded-lg border p-2"
                onClick={() => setAction(null)}
              >
                <X className="size-4" />
              </button>
            </div>
            <form action={submit} className="mt-5 space-y-4">
              {["DEPOSIT", "PARTIAL_PAYMENT"].includes(action) && (
                <Field label="Monto recibido">
                  <input
                    max={receivable.outstandingBalance}
                    min="1"
                    name="amount"
                    required
                    type="number"
                  />
                </Field>
              )}
              {action === "FULL_PAYMENT" && (
                <p className="rounded-xl border p-4 text-sm">
                  Se registrará automáticamente el saldo pendiente de{" "}
                  <strong>{money(receivable.outstandingBalance)}</strong>.
                </p>
              )}
              {action === "RETURN_PENDING" && (
                <p className="rounded-xl border p-4 text-sm">
                  Se revertirán contablemente los movimientos aplicados. El
                  historial permanecerá visible.
                </p>
              )}
              {["DEPOSIT", "PARTIAL_PAYMENT", "FULL_PAYMENT"].includes(
                action,
              ) && (
                <>
                  <Field label="Fecha">
                    <input
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      name="occurredOn"
                      required
                      type="date"
                    />
                  </Field>
                  <Field label="Método de pago">
                    <select name="method">
                      <option value="TRANSFER">Transferencia</option>
                      <option value="CARD">Tarjeta</option>
                      <option value="CASH">Efectivo</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </Field>
                  <Field label="Comprobante (opcional)">
                    <input
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      name="receipt"
                      type="file"
                    />
                  </Field>
                </>
              )}
              <Field label="Motivo">
                <input name="reason" required />
              </Field>
              <Button className="w-full" disabled={pending}>
                {pending ? "Guardando…" : labels[action]}
              </Button>
            </form>
          </div>
        </div>
      )}
      {dateEditor && <div aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 sm:items-center sm:p-6" role="dialog"><div className="w-full rounded-t-2xl border bg-card p-5 sm:max-w-lg sm:rounded-2xl"><div className="flex items-center justify-between"><h3 className="text-xl font-semibold">{dateEditor.paymentId ? "Editar fecha del pago" : "Editar fecha de vencimiento"}</h3><button aria-label="Cerrar" className="rounded-lg border p-2" onClick={() => setDateEditor(null)}><X className="size-4"/></button></div><form action={(data) => { data.set("invoiceId", receivable.id); startTransition(async () => { const result = await updateReceivableDatesAction(data); if (result.ok) { setDateEditor(null); setFeedback("Fecha actualizada y proyecciones sincronizadas."); router.refresh(); } else setFeedback(result.error); }); }} className="mt-5 space-y-4">{dateEditor.paymentId ? <><input name="paymentId" type="hidden" value={dateEditor.paymentId}/><Field label="Fecha del pago"><input defaultValue={dateEditor.paymentDate} name="paymentDate" required type="date"/></Field></> : <Field label="Fecha de vencimiento"><input defaultValue={receivable.dueDate ?? ""} name="dueDate" required type="date"/></Field>}<Field label="Motivo"><input name="reason" required/></Field><Button className="w-full" disabled={pending}>Guardar y recalcular</Button></form></div></div>}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-background/30 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold">{money(value)}</p>
    </div>
  );
}
function Action({
  label,
  icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium ${danger ? "text-danger hover:bg-danger/10" : "hover:border-brand"}`}
      onClick={onClick}
      type="button"
    >
      <span className="[&_svg]:size-4">{icon}</span>
      {label}
    </button>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-muted">{label}</span>
      <span className="[&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:bg-background [&_input]:px-3 [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:bg-background [&_select]:px-3">
        {children}
      </span>
    </label>
  );
}

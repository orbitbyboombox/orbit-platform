"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  History,
  RotateCcw,
  Trash2,
  CalendarClock,
  FileDown,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  applyReceivableMovementAction,
  attachReceivablePaymentReceiptAction,
  getReceivableReceiptUrlAction,
  manageReceivablePaymentAction,
  registerReceivablePaymentAction,
  retryReceivablePaymentReceiptDriveAction,
  confirmReconciledPaymentAction,
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
  receiptName?: string | null;
  receiptDocumentId?: string | null;
  receiptUploadedAt?: string | null;
  receiptDriveStatus?: "PENDING" | "SYNCED" | "ERROR" | null;
  receiptDriveError?: string | null;
  createdBy?: string | null;
  createdAt?: string;
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
const chileDateFormatter = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const chileInputDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
};
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
  reconciliationId,
}: {
  projectId: string;
  receivable: EventReceivable;
  reconciliationId?: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<ReceivableMovementAction | null>(null);
  const [actionRequestId, setActionRequestId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [newPayment, setNewPayment] = useState(false);
  const [newPaymentRequestId, setNewPaymentRequestId] = useState("");
  const [newPaymentError, setNewPaymentError] = useState("");
  const [dateEditor, setDateEditor] = useState(false);
  const [movementEditor, setMovementEditor] = useState<{ mode: "EDIT" | "DELETE"; item: Movement } | null>(null);
  const [receiptAttachment, setReceiptAttachment] = useState<Movement | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = (data: FormData) => {
    if (!action) return;
    data.set("invoiceId", receivable.id);
    data.set("projectId", projectId);
    data.set("movementAction", action);
    data.set("requestId", actionRequestId);
    startTransition(async () => {
      const result = await applyReceivableMovementAction(data);
      if (result.ok) {
        setAction(null);
        setFeedback(result.message ?? "Movimiento registrado y saldos sincronizados.");
        router.refresh();
      } else setFeedback(result.error);
    });
  };
  const openAction = (value: ReceivableMovementAction) => {
    setAction(value);
    setActionRequestId(crypto.randomUUID());
  };
  const openNewPayment = () => {
    setNewPaymentError("");
    setNewPaymentRequestId(crypto.randomUUID());
    setNewPayment(true);
  };
  const closeNewPayment = () => {
    if (pending) return;
    setNewPaymentError("");
    setNewPayment(false);
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
          <h2 className="mt-1 text-xl font-semibold">Payment Ledger</h2>
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
        <Metric label="Total recibido" value={receivable.paidAmount} />
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
      {reconciliationId&&<div className="mt-5 rounded-xl border border-brand/30 bg-brand/[.05] p-4"><p className="font-semibold">Conciliación bancaria sugerida</p><p className="mt-1 text-sm text-muted">Confirma aquí para crear un único movimiento en este Payment Ledger. La importación no afecta saldos antes de esta acción.</p><Button className="mt-3" disabled={pending} onClick={()=>startTransition(async()=>{const data=new FormData();data.set("reconciliationId",reconciliationId);data.set("invoiceId",receivable.id);data.set("projectId",projectId);const result=await confirmReconciledPaymentAction(data);setFeedback(result.ok?"Pago conciliado y proyecciones actualizadas.":result.error);if(result.ok)router.refresh();})}>{pending?"Confirmando…":"Confirmar pago conciliado"}</Button></div>}
      {receivable.status !== "CANCELLED" && receivable.outstandingBalance > 0 && (
        <Button className="mt-5" onClick={openNewPayment}>
          <Plus className="size-4" />
          Registrar nuevo pago
        </Button>
      )}
      <details className="mt-5 rounded-xl border">
        <summary className="cursor-pointer list-none px-4 py-3 font-medium">
          Gestionar pago
        </summary>
        <div className="grid gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-3">
          {receivable.status !== "CANCELLED" && (
            <>
              <Action
                label="Registrar Pago Total"
                icon={<CheckCircle2 />}
                onClick={() => openAction("FULL_PAYMENT")}
              />
              {receivable.paidAmount > 0 && (
                <Action
                  label="Volver a Pendiente"
                  icon={<RotateCcw />}
                  onClick={() => openAction("RETURN_PENDING")}
                />
              )}
              <Action
                label="Archivar Cuenta"
                icon={<Archive />}
                onClick={() => openAction("ARCHIVE")}
              />
              <Action
                label="Cancelar Cuenta"
                icon={<X />}
                onClick={() => openAction("CANCEL")}
              />
            </>
          )}
          <Action
            label="Editar vencimiento"
            icon={<CalendarClock />}
            onClick={() => setDateEditor(true)}
          />
          <Action
            danger
            label="Eliminar Cuenta"
            icon={<Trash2 />}
            onClick={() => openAction("DELETE")}
          />
        </div>
      </details>
      {receivable.movements.length > 0 && (
        <div className="mt-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" />
            Historial de pagos
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
                    {chileDateFormatter.format(new Date(item.paidAt))} ·{" "}
                    {paymentMethod(item.method)}
                  </p>
                  {item.reason && <p className="mt-1 text-xs text-muted">{item.reason}</p>}
                  {item.receiptPath ? <div className="mt-2 space-y-1"><button className="inline-flex items-center gap-1 text-xs text-brand" onClick={() => startTransition(async () => { const result = await getReceivableReceiptUrlAction(item.receiptPath!); if (result.ok) window.open(result.url, "_blank", "noopener,noreferrer"); else setFeedback(result.error); })} type="button"><FileDown className="size-3"/>VER COMPROBANTE · {item.receiptName || "Archivo adjunto"}</button><p className="text-xs text-muted">{item.receiptUploadedAt ? `Subido ${chileDateFormatter.format(new Date(item.receiptUploadedAt))} · ` : ""}Drive: {item.receiptDriveStatus === "SYNCED" ? "Archivado" : item.receiptDriveStatus === "ERROR" ? "Pendiente (último intento falló)" : "Pendiente"}</p>{item.receiptDriveStatus !== "SYNCED" ? <button className="inline-flex items-center gap-1 text-xs text-brand" disabled={pending} onClick={() => startTransition(async () => { const result = await retryReceivablePaymentReceiptDriveAction({ invoiceId: receivable.id, projectId, paymentId: item.id }); setFeedback(result.ok ? result.message ?? "Sincronización procesada." : result.error); if (result.ok) router.refresh(); })} type="button"><RefreshCw className="size-3"/>Reintentar archivo en Drive</button> : null}</div> : <button className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold text-brand" onClick={() => setReceiptAttachment(item)} type="button"><Paperclip className="size-3"/>ADJUNTAR COMPROBANTE</button>}
                </div>
                <strong
                  className={item.amount < 0 ? "text-danger" : "text-success"}
                >
                  {item.amount < 0 ? "−" : "+"}
                  {money(Math.abs(item.amount))}
                </strong>
                {item.amount > 0 && <div className="mt-2 flex gap-3 sm:mt-0"><button className="inline-flex items-center gap-1 text-xs text-brand" onClick={() => setMovementEditor({ mode: "EDIT", item })} type="button"><Pencil className="size-3"/>Editar movimiento</button><button className="inline-flex items-center gap-1 text-xs text-danger" onClick={() => setMovementEditor({ mode: "DELETE", item })} type="button"><Trash2 className="size-3"/>Eliminar</button></div>}
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
        <MobileDialog
          dismissOnOverlayClick={false}
          eyebrow={labels[action]}
          onClose={() => setAction(null)}
          size="lg"
          title={receivable.invoiceNumber}
        >
          <form action={submit} className="space-y-4">
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
                    defaultValue={chileInputDate()}
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
        </MobileDialog>
      )}
      {newPayment && (
        <NewPaymentDialog
          invoiceId={receivable.id}
          maxAmount={receivable.outstandingBalance}
          requestId={newPaymentRequestId}
          error={newPaymentError}
          onClose={closeNewPayment}
          onSubmit={(data) =>
            startTransition(async () => {
              const result = await registerReceivablePaymentAction(data);
              if (result.ok) {
                setNewPayment(false);
                setNewPaymentError("");
                setFeedback(result.message ?? "Nuevo pago registrado y saldos recalculados.");
                router.refresh();
              } else {
                setNewPaymentError(result.error);
                setFeedback(result.error);
              }
            })
          }
          pending={pending}
          projectId={projectId}
        />
      )}
      {dateEditor && (
        <MobileDialog
          dismissOnOverlayClick={false}
          onClose={() => setDateEditor(false)}
          size="lg"
          title="Editar fecha de vencimiento"
        >
          <form action={(data) => { data.set("invoiceId", receivable.id); startTransition(async () => { const result = await updateReceivableDatesAction(data); if (result.ok) { setDateEditor(false); setFeedback("Fecha actualizada y proyecciones sincronizadas."); router.refresh(); } else setFeedback(result.error); }); }} className="space-y-4"><Field label="Fecha de vencimiento"><input defaultValue={receivable.dueDate ?? ""} name="dueDate" required type="date"/></Field><Field label="Motivo"><input name="reason" required/></Field><Button className="w-full" disabled={pending}>Guardar y recalcular</Button></form>
        </MobileDialog>
      )}
      {movementEditor && (
        <MovementEditor
          invoiceId={receivable.id}
          mode={movementEditor.mode}
          movement={movementEditor.item}
          onClose={() => setMovementEditor(null)}
          onSubmit={(data) =>
            startTransition(async () => {
              const result = await manageReceivablePaymentAction(data);
              if (result.ok) {
                setMovementEditor(null);
                setFeedback(result.message ?? (movementEditor.mode === "EDIT"
                  ? "Movimiento actualizado y saldos recalculados."
                  : "Movimiento eliminado y saldos recalculados."));
                router.refresh();
              } else setFeedback(result.error);
            })
          }
          pending={pending}
          projectId={projectId}
        />
      )}
      {receiptAttachment && (
        <MobileDialog dismissOnOverlayClick={false} eyebrow="Payment Ledger" onClose={() => { if (!pending) setReceiptAttachment(null); }} size="lg" title="Adjuntar comprobante al pago existente">
          <form action={(data) => { data.set("invoiceId", receivable.id); data.set("projectId", projectId); data.set("paymentId", receiptAttachment.id); startTransition(async () => { const result = await attachReceivablePaymentReceiptAction(data); setFeedback(result.ok ? result.message ?? "Comprobante adjuntado sin modificar el pago." : result.error); if (result.ok) { setReceiptAttachment(null); router.refresh(); } }); }} className="space-y-4">
            <p className="rounded-xl border p-4 text-sm">Se adjuntará el archivo al movimiento existente por <strong>{money(Math.abs(receiptAttachment.amount))}</strong>. No se creará otro pago ni se modificarán el monto recibido o el saldo.</p>
            <Field label="Comprobante"><input accept="image/jpeg,image/png,image/webp,application/pdf" name="receipt" required type="file"/></Field>
            <Button className="w-full" disabled={pending}>{pending ? "Guardando y archivando…" : "Adjuntar comprobante"}</Button>
          </form>
        </MobileDialog>
      )}
    </section>
  );
}
function NewPaymentDialog({
  invoiceId,
  maxAmount,
  pending,
  projectId,
  requestId,
  error,
  onClose,
  onSubmit,
}: {
  invoiceId: string;
  maxAmount: number;
  pending: boolean;
  projectId: string;
  requestId: string;
  error: string;
  onClose: () => void;
  onSubmit: (data: FormData) => void;
}) {
  return (
    <MobileDialog
      dismissOnOverlayClick={false}
      eyebrow="Payment Ledger"
      onClose={onClose}
      size="lg"
      title="Registrar nuevo pago"
    >
      <form
        action={(data) => { data.set("invoiceId", invoiceId); data.set("projectId", projectId); data.set("requestId", requestId); onSubmit(data); }}
        className="space-y-4"
      >
        <Field label="Monto"><input max={maxAmount} min="1" name="amount" required type="number"/></Field><Field label="Fecha"><input defaultValue={chileInputDate()} name="paidOn" required type="date"/></Field><Field label="Método de pago"><select defaultValue="TRANSFER" name="method"><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CASH">Efectivo</option><option value="OTHER">Otro</option></select></Field><Field label="Comprobante"><input accept="image/jpeg,image/png,image/webp,application/pdf" name="receipt" type="file"/></Field><Field label="Observación (opcional)"><input name="observation"/></Field>{error&&<p aria-live="assertive" className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}<Button className="w-full" disabled={pending}>{pending ? "Registrando…" : "Guardar nuevo pago"}</Button>
      </form>
    </MobileDialog>
  );
}
function paymentMethod(method: string) { return ({ TRANSFER: "Transferencia", CARD: "Tarjeta", CASH: "Efectivo", OTHER: "Otro" } as Record<string, string>)[method] ?? method; }
function MovementEditor({ invoiceId, movement, mode, pending, projectId, onClose, onSubmit }: { invoiceId: string; movement: Movement; mode: "EDIT" | "DELETE"; pending: boolean; projectId: string; onClose: () => void; onSubmit: (data: FormData) => void }) {
  return (
    <MobileDialog
      dismissOnOverlayClick={false}
      eyebrow="Movimiento financiero"
      onClose={onClose}
      size="lg"
      title={mode === "EDIT" ? "Editar movimiento" : "Eliminar movimiento"}
    >
      <form action={(data) => { data.set("invoiceId", invoiceId); data.set("paymentId", movement.id); data.set("projectId", projectId); data.set("paymentAction", mode); onSubmit(data); }} className="space-y-4">{mode === "EDIT" ? <><Field label="Monto"><input defaultValue={Math.abs(movement.amount)} min="1" name="amount" required type="number"/></Field><Field label="Fecha"><input defaultValue={movement.paidAt.slice(0, 10)} name="paidOn" required type="date"/></Field><Field label="Método de pago"><select defaultValue={movement.method || "TRANSFER"} name="method"><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CASH">Efectivo</option><option value="OTHER">Otro</option></select></Field><Field label="Reemplazar comprobante (opcional)"><input accept="image/jpeg,image/png,image/webp,application/pdf" name="receipt" type="file"/></Field></> : <p className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">Se eliminará únicamente este movimiento por <strong>{money(Math.abs(movement.amount))}</strong>. El Cliente, Evento y cuenta por cobrar permanecen intactos.</p>}<Field label="Motivo obligatorio"><input name="reason" required/></Field><Button className="w-full" disabled={pending} variant={mode === "DELETE" ? "destructive" : "default"}>{pending ? "Guardando…" : mode === "EDIT" ? "Guardar y recalcular" : "Eliminar movimiento"}</Button></form>
    </MobileDialog>
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

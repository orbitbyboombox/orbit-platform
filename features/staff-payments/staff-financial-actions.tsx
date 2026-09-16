"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, ExternalLink, ReceiptText, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { registerStaffAdvanceAction, registerStaffReimbursementPaymentAction } from "@/features/staff-monthly-account/actions";
import {
  StaffExpenseReview,
  type StaffExpenseReviewItem,
} from "@/features/staff-expenses/staff-expense-review";
import { staffExpenseReceiptUrlAction } from "@/features/staff-expenses/staff-expense-review.actions";
import type { StaffPaymentEvent, StaffPaymentMember } from "./staff-payments-center";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const chileToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

export type StaffReimbursementPaymentItem = {
  expenseId: string;
  submissionId: string;
  staffId: string;
  staffName: string;
  projectId: string;
  eventName: string;
  orbitEventId: string;
  category: string;
  description: string;
  amount: number;
  occurredOn: string;
  receiptPath: string;
};

export function StaffFinancialActions({ staff, events, pendingExpenses, approvedReimbursements, initialReviewExpenseId }: {
  staff: StaffPaymentMember[];
  events: StaffPaymentEvent[];
  pendingExpenses: StaffExpenseReviewItem[];
  approvedReimbursements: StaffReimbursementPaymentItem[];
  initialReviewExpenseId?: string;
}) {
  const router = useRouter();
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [reimbursementOpen, setReimbursementOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(Boolean(initialReviewExpenseId));
  const [staffId, setStaffId] = useState("");
  const [settlementId, setSettlementId] = useState("");
  const [method, setMethod] = useState("TRANSFERENCIA");
  const [reimbursementStaffId, setReimbursementStaffId] = useState("");
  const [reimbursementExpenseId, setReimbursementExpenseId] = useState("");
  const [reimbursementMethod, setReimbursementMethod] = useState("TRANSFERENCIA");
  const [reimbursementRequestId, setReimbursementRequestId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const relevantEvents = useMemo(
    () => events.filter((event) => event.staffId === staffId && Math.max(event.payrollNet - event.payrollPaidAmount, 0) > 0),
    [events, staffId],
  );
  const selected = relevantEvents.find((event) => event.id === settlementId);
  const remaining = selected ? Math.max(selected.payrollNet - selected.payrollPaidAmount, 0) : 0;
  const staffReimbursements = useMemo(
    () => approvedReimbursements.filter((item) => item.staffId === reimbursementStaffId),
    [approvedReimbursements, reimbursementStaffId],
  );
  const selectedReimbursement = staffReimbursements.find((item) => item.expenseId === reimbursementExpenseId);

  const selectStaff = (value: string) => {
    setStaffId(value);
    setSettlementId("");
  };
  const openReimbursement = () => {
    setReimbursementRequestId(crypto.randomUUID());
    setReimbursementOpen(true);
  };
  const openExpenseReceipt = (path: string) => startTransition(async () => {
    const result = await staffExpenseReceiptUrlAction(path);
    if (result.ok && result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    else setMessage(result.message ?? "No fue posible abrir el comprobante del gasto.");
  });

  return <section aria-label="Acciones financieras Staff" className="rounded-2xl border border-brand/25 bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Staff · Finanzas operacionales</p><h2 className="mt-1 text-lg font-semibold">Adelantos y gastos por revisar</h2><p className="mt-1 text-xs text-muted">Movimientos vinculados a la liquidación canónica de cada Evento.</p></div>
      <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
        <Button onClick={() => setAdvanceOpen(true)} type="button"><WalletCards className="size-4" />INGRESAR PAGO POR ADELANTADO</Button>
        <Button onClick={openReimbursement} type="button" variant="outline"><Banknote className="size-4" />PAGAR REEMBOLSO <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-brand-foreground">{approvedReimbursements.length}</span></Button>
        <Button onClick={() => setExpensesOpen(true)} type="button" variant="outline"><ReceiptText className="size-4" />GASTOS PENDIENTES <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-brand-foreground">{pendingExpenses.length}</span></Button>
      </div>
    </div>
    {message ? <p aria-live="polite" className="mt-3 rounded-xl border bg-background/40 p-3 text-sm">{message}</p> : null}
    {advanceOpen ? <MobileDialog description="El adelanto se descuenta del saldo del Evento y queda respaldado por su comprobante." dismissOnOverlayClick={!pending} eyebrow="Staff · Liquidación canónica" onClose={() => !pending && setAdvanceOpen(false)} size="lg" title="INGRESAR PAGO POR ADELANTADO" variant="fullscreen-mobile">
      <form action={(form) => startTransition(async () => {
        const result = await registerStaffAdvanceAction(form);
        setMessage(result.message);
        if (result.ok) {
          setAdvanceOpen(false);
          setStaffId("");
          setSettlementId("");
          router.refresh();
        }
      })} className="grid gap-4" aria-busy={pending}>
        <label className="text-sm font-medium">Colaborador *<select className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" onChange={(event) => selectStaff(event.target.value)} required value={staffId}><option value="">Selecciona un colaborador</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.rut}</option>)}</select></label>
        <label className="text-sm font-medium">Evento asignado *<select className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" disabled={!staffId} name="settlementId" onChange={(event) => setSettlementId(event.target.value)} required value={settlementId}><option value="">{staffId ? "Selecciona un Evento" : "Primero selecciona colaborador"}</option>{relevantEvents.map((event) => <option key={event.id} value={event.id}>{event.eventName} · {event.eventDate} · saldo honorarios {money.format(Math.max(event.payrollNet - event.payrollPaidAmount, 0))}</option>)}</select></label>
        {staffId && !relevantEvents.length ? <p className="rounded-xl border border-dashed p-3 text-sm text-muted">Este colaborador no tiene liquidaciones confirmadas con saldo pendiente.</p> : null}
        {selected ? <dl className="grid grid-cols-3 gap-2 rounded-xl border bg-background/40 p-3 text-xs"><div><dt className="text-muted">Honorarios</dt><dd className="mt-1 font-semibold">{money.format(selected.payrollNet)}</dd></div><div><dt className="text-muted">Ya pagado</dt><dd className="mt-1 font-semibold">{money.format(selected.payrollPaidAmount)}</dd></div><div><dt className="text-muted">Saldo honorarios</dt><dd className="mt-1 font-semibold text-brand">{money.format(remaining)}</dd></div></dl> : null}
        <label className="text-sm font-medium">Monto adelantado *<input className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" disabled={!selected} max={remaining || undefined} min="1" name="amount" required step="1" type="number" /></label>
        <label className="text-sm font-medium">Fecha del adelanto *<input className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" defaultValue={chileToday()} name="date" required type="date" /></label>
        <label className="text-sm font-medium">Método de pago *<select className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" name="method" onChange={(event) => setMethod(event.target.value)} required value={method}><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="OTRO">Otro</option></select>{method === "OTRO" ? <input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="methodOther" placeholder="Indica el método" required /> : null}</label>
        <label className="text-sm font-medium">Observación opcional<textarea className="mt-1 min-h-24 w-full rounded-xl border bg-background px-3 py-2" name="notes" /></label>
        <label className="text-sm font-medium">Comprobante de pago *<input accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" name="receipt" required type="file" /></label>
        <label className="text-sm font-medium">Boleta de honorarios (opcional)<input accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" name="boleta" type="file" /></label>
        <Button disabled={!selected || remaining <= 0} loading={pending} loadingLabel="Registrando adelanto…" type="submit">CONFIRMAR ADELANTO</Button>
      </form>
    </MobileDialog> : null}
    {reimbursementOpen ? <MobileDialog description="Solo aparecen gastos aprobados cuyo reembolso aún no ha sido pagado." dismissOnOverlayClick={!pending} eyebrow="Staff · Movimiento financiero separado" onClose={() => !pending && setReimbursementOpen(false)} size="lg" title="PAGAR REEMBOLSO" variant="fullscreen-mobile">
      <form action={(form) => startTransition(async () => {
        const result = await registerStaffReimbursementPaymentAction(form);
        setMessage(result.message);
        if (result.ok) {
          setReimbursementOpen(false);
          setReimbursementStaffId("");
          setReimbursementExpenseId("");
          router.refresh();
        }
      })} aria-busy={pending} className="grid gap-4">
        <label className="text-sm font-medium">Colaborador *<select className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" onChange={(event) => { setReimbursementStaffId(event.target.value); setReimbursementExpenseId(""); }} required value={reimbursementStaffId}><option value="">Selecciona un colaborador</option>{staff.filter((member) => approvedReimbursements.some((item) => item.staffId === member.id)).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.rut}</option>)}</select></label>
        <label className="text-sm font-medium">Evento y reembolso aprobado *<select className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" disabled={!reimbursementStaffId} onChange={(event) => setReimbursementExpenseId(event.target.value)} required value={reimbursementExpenseId}><option value="">{reimbursementStaffId ? "Selecciona un reembolso" : "Primero selecciona colaborador"}</option>{staffReimbursements.map((item) => <option key={item.expenseId} value={item.expenseId}>{item.orbitEventId || item.eventName} · {item.category} · {money.format(item.amount)}</option>)}</select></label>
        {reimbursementStaffId && !staffReimbursements.length ? <p className="rounded-xl border border-dashed p-3 text-sm text-muted">Este colaborador no tiene reembolsos aprobados pendientes de pago.</p> : null}
        {selectedReimbursement ? <div className="rounded-xl border bg-background/40 p-4"><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">Evento</dt><dd className="font-semibold">{selectedReimbursement.orbitEventId || selectedReimbursement.eventName}</dd></div><div><dt className="text-muted">Categoría</dt><dd className="font-semibold">{selectedReimbursement.category}</dd></div><div><dt className="text-muted">Fecha del gasto</dt><dd className="font-semibold">{selectedReimbursement.occurredOn}</dd></div><div><dt className="text-muted">Monto aprobado</dt><dd className="font-semibold text-brand">{money.format(selectedReimbursement.amount)}</dd></div><div className="sm:col-span-2"><dt className="text-muted">Descripción</dt><dd className="font-semibold">{selectedReimbursement.description || "Sin descripción"}</dd></div></dl><Button className="mt-3" disabled={pending} onClick={() => openExpenseReceipt(selectedReimbursement.receiptPath)} type="button" variant="outline">VER COMPROBANTE DEL GASTO <ExternalLink className="size-4" /></Button></div> : null}
        <input name="expenseId" type="hidden" value={selectedReimbursement?.expenseId ?? ""} />
        <input name="amount" type="hidden" value={selectedReimbursement?.amount ?? ""} />
        <input name="requestId" type="hidden" value={reimbursementRequestId} />
        <label className="text-sm font-medium">Monto<input className="mt-1 min-h-11 w-full rounded-xl border bg-muted/20 px-3" readOnly value={selectedReimbursement ? money.format(selectedReimbursement.amount) : ""} /></label>
        <label className="text-sm font-medium">Fecha de pago *<input className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" defaultValue={chileToday()} name="paidOn" required type="date" /></label>
        <label className="text-sm font-medium">Método de pago *<select className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" name="method" onChange={(event) => setReimbursementMethod(event.target.value)} required value={reimbursementMethod}><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="OTRO">Otro</option></select>{reimbursementMethod === "OTRO" ? <input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" name="methodOther" placeholder="Indica el método" required /> : null}</label>
        <label className="text-sm font-medium">Comprobante de pago (opcional)<input accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" name="receipt" type="file" /></label>
        <label className="text-sm font-medium">Observación<textarea className="mt-1 min-h-24 w-full rounded-xl border bg-background px-3 py-2" name="notes" /></label>
        <Button disabled={!selectedReimbursement} loading={pending} loadingLabel="Registrando reembolso…" type="submit">REGISTRAR PAGO DEL REEMBOLSO</Button>
      </form>
    </MobileDialog> : null}
    {expensesOpen ? <MobileDialog description={`${pendingExpenses.length} ${pendingExpenses.length === 1 ? "gasto pendiente" : "gastos pendientes"} · aprobar actualiza liquidación y saldo`} dismissOnOverlayClick={false} eyebrow="Staff · Founder/Admin" onClose={() => setExpensesOpen(false)} size="xl" title="GASTOS PENDIENTES" variant="fullscreen-mobile"><StaffExpenseReview embedded focusId={initialReviewExpenseId} items={pendingExpenses} /></MobileDialog> : null}
  </section>;
}

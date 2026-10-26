"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Search, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import {
  closeStaffMonthAction,
  previewStaffMonthCloseAction,
  reopenStaffMonthAction,
  registerQuickStaffSettlementPaymentAction,
} from "./actions";
import { StaffMonthlyAccountPanel } from "@/features/staff-monthly-account/staff-monthly-account-panel";
import { generateMonthlyStaffAccountsAction, requestIndividualStaffBoletaAction } from "@/features/staff-monthly-account/actions";
import { registerMonthlyStaffPaymentAction } from "@/features/staff-monthly-account/actions";
import type { StaffMonthlyAccount } from "@/features/staff-monthly-account/model";

export type StaffPaymentEvent = {
  id: string;
  staffId: string;
  projectId: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  accountingMonth: string;
  customer: string;
  service: string;
  durationHours: number;
  roles: string[];
  amount: number;
  originalNet: number;
  adjustmentTotal: number;
  reimbursementTotal: number;
  reimbursementPaidAmount: number;
  reimbursementPendingAmount: number;
  payrollNet: number;
  payrollPaidAmount: number;
  finalAmount: number;
  operator: number;
  assembly: number;
  disassembly: number;
  overrideReason: string;
  status: string;
  settlementStatus: string;
  paidAmount: number;
  paidAt: string;
  receiptStatus: string;
  blockName: string;
  blockStartAt: string;
  blockEndAt: string;
};
export type StaffPaymentMonth = {
  id: string;
  staffId: string;
  month: string;
  tax: number;
  advances: number;
  paid: number;
  status: string;
  documents: { id: string; type: string; name: string; createdAt: string }[];
  account?: import("@/features/staff-monthly-account/model").StaffMonthlyAccount;
};
export type StaffPaymentMember = { id: string; name: string; rut: string };
export type StaffReimbursementDetail = {
  id: string;
  staffId: string;
  occurredOn: string;
  eventName: string;
  projectId: string;
  category: string;
  description: string;
  amount: number;
  status: string;
  receiptDocumentId: string | null;
};
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const roleLabel = (value: string) =>
  ({ OPERATOR: "Operador", ASSEMBLY: "Montaje", DISASSEMBLY: "Desmontaje" })[
    value
  ] ?? value;
const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
};
const boletaLabel = (account: StaffMonthlyAccount) =>
  account.boletaStatus === "APPROVED"
    ? "APROBADA ✓"
    : account.boletaStatus === "RECEIVED"
      ? "EN REVISIÓN"
      : account.boletaStatus === "REJECTED"
        ? "RECHAZADA"
        : "PENDIENTE";
const paymentLabel = (account: StaffMonthlyAccount) =>
  account.paymentStatus === "PAID"
    ? "PAGADO ✓"
    : account.paymentStatus === "READY_TO_PAY"
      ? "PENDIENTE"
      : "BLOQUEADO";

function AdminFinanceSummary({
  row,
  reimbursements,
}: {
  row: {
    eventRows: StaffPaymentEvent[];
    reimbursementsPending: number;
    reimbursementsPaid: number;
    paid: number;
    outstanding: number;
    account?: StaffPaymentMonth["account"];
  };
  reimbursements: StaffReimbursementDetail[];
}) {
  const upcoming = row.eventRows.filter((item) => !["COMPLETED", "PAID", "FINISHED", "CLOSED"].includes(item.status));
  const upcomingTotal = upcoming.reduce((sum, item) => sum + item.finalAmount, 0);
  const honorariaPending = Math.max(row.outstanding - row.reimbursementsPending, 0);
  const paid = row.paid;
  const reimbursementPendingRows = reimbursements.filter((item) => item.status === "PENDIENTE");
  const reimbursementPaidRows = reimbursements.filter((item) => item.status === "PAGADO");
  const pendingSum = reimbursementPendingRows.reduce((sum, item) => sum + item.amount, 0);
  const paidSum = reimbursementPaidRows.reduce((sum, item) => sum + item.amount, 0);
  const pendingMismatch = pendingSum !== row.reimbursementsPending;
  const paidMismatch = paidSum !== row.reimbursementsPaid;
  return (
    <section className="space-y-2 rounded-2xl border border-brand/25 bg-brand/5 p-4" aria-label="Resumen financiero canónico">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">TOTAL A TRANSFERIR AHORA</p>
      <p className="text-3xl font-bold tabular-nums text-brand">{money.format(honorariaPending + row.reimbursementsPending)}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Honorarios pendientes" value={honorariaPending} />
        <Metric label="Próximos trabajos" value={upcomingTotal} />
        <Metric label="Reembolsos pendientes" value={row.reimbursementsPending} />
        <Metric label="Pagado" value={paid} />
      </div>
      <details className="rounded-xl border bg-background">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span>PRÓXIMOS TRABAJOS</span><span>{money.format(upcomingTotal)} ›</span>
        </summary>
        <div className="space-y-2 border-t p-3 text-sm">
          {upcoming.map((item) => <div className="flex justify-between gap-3" key={item.id}><span>{item.eventName} · {item.roles.map(roleLabel).join(" + ")}</span><strong>{money.format(item.finalAmount)}</strong></div>)}
          {!upcoming.length ? <p className="text-muted">Sin próximos trabajos.</p> : null}
        </div>
      </details>
      <details className="rounded-xl border bg-background">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span>HISTORIAL PAGADO</span><span>{money.format(paid)} ›</span></summary>
        <div className="border-t p-3 text-sm">{paid ? `Honorarios pagados: ${money.format(paid)}` : "Sin pagos registrados."}</div>
      </details>
      <details className="rounded-xl border bg-background">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span>REEMBOLSOS</span><span>{money.format(row.reimbursementsPending)} ›</span></summary>
        <div className="space-y-2 border-t p-3 text-sm">
          {reimbursements.map((item) => <div className="rounded-lg border p-3" key={item.id}><div className="flex justify-between gap-3"><span>{item.occurredOn} · {item.eventName}</span><strong>{money.format(item.amount)}</strong></div><p className="text-muted">{item.category}{item.description ? ` · ${item.description}` : ""}</p><p className="text-xs">Estado: {item.status}{item.receiptDocumentId ? " · Comprobante disponible" : " · Sin comprobante"}</p></div>)}
          {!reimbursements.length ? <p className="text-muted">Sin reembolsos registrados.</p> : null}
          {pendingMismatch || paidMismatch ? <p className="text-sm font-semibold text-amber-300">Inconsistencia: el total no coincide con los registros visibles.</p> : null}
        </div>
      </details>
      <details className="rounded-xl border bg-background"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span>CIERRE MENSUAL</span><span>{money.format(row.account?.finalTransferAmount ?? 0)} ›</span></summary><div className="border-t p-3 text-sm text-muted">Detalle disponible en la liquidación mensual.</div></details>
      <details className="rounded-xl border bg-background"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span>DATOS / BOLETA</span><span>›</span></summary><div className="border-t p-3 text-sm text-muted">Datos disponibles en el cierre mensual.</div></details>
    </section>
  );
}

export function StaffPaymentsCenter({
  staff,
  events,
  months,
  reimbursements,
  initialReviewAccountId,
}: {
  staff: StaffPaymentMember[];
  events: StaffPaymentEvent[];
  months: StaffPaymentMonth[];
  reimbursements?: StaffReimbursementDetail[];
  initialReviewAccountId?: string;
}) {
  const reimbursementDetails = reimbursements ?? [];
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);
  const [boletaRequested, setBoletaRequested] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [closeState, setCloseState] = useState<{
      status?: string;
      dueDate?: string;
      eligible?: number;
      ineligible?: number;
      finalizedStaff?: number;
      excludedStaff?: number;
      totals?: {
        people?: number;
        total?: number;
        paid?: number;
        pending?: number;
        receiptsPending?: number;
      };
    } | null>(null),
    [closeMessage, setCloseMessage] = useState(""),
    [reopenReason, setReopenReason] = useState(""),
    [closeOperation, setCloseOperation] = useState<
      "GENERATE" | "CLOSE" | "REOPEN" | null
    >(null),
    [closing, startClosing] = useTransition();
  useEffect(() => {
    if (!initialReviewAccountId) return;
    const target = months.find(
      (item) => item.account?.id === initialReviewAccountId,
    );
    if (target) {
      setMonth(target.month.slice(0, 7));
      setOpenStaffId(target.staffId);
    }
  }, [initialReviewAccountId, months]);
  useEffect(() => {
    let active = true;
    startClosing(async () => {
      const result = await previewStaffMonthCloseAction(month);
      if (active) {
        if (result.ok) setCloseState(result.data);
        else
          setCloseMessage(
            result.error ?? "No fue posible cargar el cierre mensual.",
          );
      }
    });
    return () => {
      active = false;
    };
  }, [month]);
  const rows = useMemo(
    () =>
      staff
        .filter((member) =>
          `${member.name} ${member.rut}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .map((member) => {
          const eventRows = events.filter(
            (item) =>
              item.staffId === member.id && item.eventDate.startsWith(month),
          );
          const original = eventRows.reduce(
              (sum, item) => sum + item.originalNet,
              0,
            ),
            adjustments = eventRows.reduce(
              (sum, item) => sum + item.adjustmentTotal,
              0,
            ),
            reimbursements = eventRows.reduce(
              (sum, item) => sum + item.reimbursementTotal,
              0,
            ),
            reimbursementsPaid = eventRows.reduce(
              (sum, item) => sum + item.reimbursementPaidAmount,
              0,
            ),
            reimbursementsPending = eventRows.reduce(
              (sum, item) => sum + item.reimbursementPendingAmount,
              0,
            ),
            payrollNet = original + adjustments,
            finalAmount = payrollNet + reimbursements,
            payrollPaid = eventRows.reduce(
              (sum, item) => sum + item.payrollPaidAmount,
              0,
            ),
            paid = payrollPaid + reimbursementsPaid;
          return {
            member,
            eventRows,
            original,
            adjustments,
            reimbursements,
            reimbursementsPaid,
            reimbursementsPending,
            finalAmount,
            paid,
            outstanding:
              Math.max(payrollNet - payrollPaid, 0) + reimbursementsPending,
            account: months.find(
              (item) =>
                item.staffId === member.id && item.month.startsWith(month),
            )?.account,
          };
        })
        .filter((row) => row.eventRows.length > 0 || Boolean(row.account)),
    [events, month, months, query, staff],
  );
  const pendingStaffRows = rows.filter((row) => row.outstanding > 0);
  const pendingStaffTotal = pendingStaffRows.reduce((sum, row) => sum + row.outstanding, 0);
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
            Staff · Registro mensual
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Liquidación mensual Staff
          </h2>
          <p className="mt-2 text-sm text-muted">
            Trabajo, boleta SII, adelantos y saldo final desde una sola fuente
            canónica.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Mes
            <input
              className="mt-1 h-11 w-full rounded-xl border bg-background px-3"
              onChange={(e) => setMonth(e.target.value)}
              type="month"
              value={month}
            />
          </label>
          <label className="text-xs text-muted">
            Buscar
            <div className="relative mt-1">
              <Search className="absolute left-3 top-3.5 size-4" />
              <input
                className="h-11 w-full rounded-xl border bg-background pl-9 pr-3"
                onChange={(e) => setQuery(e.target.value)}
                value={query}
              />
            </div>
          </label>
        </div>
      </header>
      <section className="rounded-2xl border border-brand/25 bg-brand/5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
              Cierre mensual Staff
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              {month} · {closeState?.status ?? "OPEN"}
            </h3>
            <p className="mt-1 text-sm text-muted">
              Al cerrar, ORBIT congela las liquidaciones, genera cada PDF y
              solicita la boleta por correo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form
              action={(form) =>
                startClosing(async () => {
                  setCloseOperation("GENERATE");
                  try {
                    const result =
                      await generateMonthlyStaffAccountsAction(form);
                    setCloseMessage(result.message);
                    // Keep the response visible; server action revalidates the account without a full-page reload.
                  } finally {
                    setCloseOperation(null);
                  }
                })
              }
            >
              <input name="month" type="hidden" value={month} />
              <Button
                disabled={closing}
                loading={closeOperation === "GENERATE"}
                loadingLabel="Actualizando…"
              >
                Generar / actualizar liquidaciones
              </Button>
            </form>
            <Button
              disabled={
                closing ||
                closeState?.status === "CLOSED" ||
                closeState?.status === "PAID"
              }
              loading={closeOperation === "CLOSE"}
              loadingLabel="Generando y enviando…"
              onClick={() =>
                startClosing(async () => {
                  setCloseOperation("CLOSE");
                  try {
                    const result = await closeStaffMonthAction(month);
                    if (result.ok) {
                      setCloseState(result.data);
                      setCloseMessage(
                        `Mes cerrado · ${result.delivered ?? 0} correo(s) enviado(s) · ${result.idempotent ?? 0} ya procesado(s).`,
                      );
                    } else
                      setCloseMessage(
                        result.error ?? "No fue posible cerrar el mes.",
                      );
                  } finally {
                    setCloseOperation(null);
                  }
                })
              }
              variant="outline"
            >
              CERRAR MES Y SOLICITAR BOLETAS
            </Button>
            <input
              className="min-h-11 rounded-xl border bg-background px-3"
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder="Motivo para reabrir"
              value={reopenReason}
            />
            <Button
              disabled={
                closing ||
                closeState?.status !== "CLOSED" ||
                reopenReason.trim().length < 3
              }
              loading={closeOperation === "REOPEN"}
              loadingLabel="Reabriendo…"
              onClick={() =>
                startClosing(async () => {
                  setCloseOperation("REOPEN");
                  try {
                    const result = await reopenStaffMonthAction(
                      month,
                      reopenReason,
                    );
                    if (result.ok) {
                      setCloseState(result.data);
                      setCloseMessage("Mes reabierto con auditoría.");
                    } else
                      setCloseMessage(
                        result.error ?? "No fue posible reabrir el mes.",
                      );
                  } finally {
                    setCloseOperation(null);
                  }
                })
              }
              variant="outline"
            >
              Reabrir
            </Button>
          </div>
        </div>
        <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7">
          <Metric
            label="Personas"
            value={Number(closeState?.totals?.people ?? 0)}
          />
          <Metric
            label="Total"
            value={Number(closeState?.totals?.total ?? 0)}
          />
          <Metric
            label="Pagado"
            value={Number(closeState?.totals?.paid ?? 0)}
          />
          <Metric
            label="Pendiente"
            value={Number(closeState?.totals?.pending ?? 0)}
          />
          <Metric label="Colaboradores pendientes" value={pendingStaffRows.length} />
          <Metric label="Total pendiente por pagar" value={pendingStaffTotal} />
          <Metric
            label="Boletas pendientes"
            value={Number(closeState?.totals?.receiptsPending ?? 0)}
          />
          <Metric label="Elegibles" value={Number(closeState?.eligible ?? 0)} />
          <Metric
            label="Personas cerradas"
            value={Number(closeState?.finalizedStaff ?? 0)}
          />
          <Metric
            label="Boletas solicitadas"
            value={Number(closeState?.finalizedStaff ?? 0)}
          />
          <Metric
            label="Excluidas en cero"
            value={Number(closeState?.excludedStaff ?? closeState?.ineligible ?? 0)}
          />
        </div>
        {closeMessage && (
          <p aria-live="polite" className="mt-3 text-sm text-muted">
            {closeMessage}
          </p>
        )}
      </section>
      <section className="rounded-2xl border p-4 sm:p-5">
        <h3 className="text-lg font-semibold">Solicitar boleta por operador</h3>
        <p className="mt-1 text-sm text-muted">Cada botón cierra únicamente la liquidación seleccionada y envía su solicitud de boleta. Los demás operadores permanecen pendientes.</p>
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            const account = months.find((item) => item.staffId === row.member.id && item.month.slice(0, 7) === month)?.account;
            if (!account) return null;
            const done = Boolean(boletaRequested[`${month}:${row.member.id}`]);
            const eligible = !done && !account.reviewRequired && account.workNet > 0 && account.boletaStatus === "PENDING";
            return <div key={row.member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div><p className="font-medium">{row.member.name}</p><p className="text-xs text-muted">{account.settlementStatus} · {account.reviewRequired ? "Requiere revisión" : account.boletaStatus}</p></div>
              <form action={(form) => startClosing(async () => {
                const result = await requestIndividualStaffBoletaAction(form);
                setCloseMessage(result.message);
                if (result.ok) setBoletaRequested((previous) => ({ ...previous, [`${month}:${row.member.id}`]: true }));
              })}>
                <input type="hidden" name="month" value={month}/>
                <input type="hidden" name="staffId" value={row.member.id}/>
                <Button disabled={closing || !eligible}>{done ? "Listo ✓" : closing ? "Procesando…" : "Cerrar y solicitar boleta"}</Button>
              </form>
            </div>;
          })}
        </div>
      </section>
      <StaffFinanceDriveSync />
      <QuickStaffPayment rows={rows} />
      <PaymentSheet month={month} rows={rows} />
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((row) => (
          <details
            open={openStaffId === row.member.id}
            className="rounded-2xl border p-4 sm:p-5"
            onToggle={(event) => {
              if (event.currentTarget.open) setOpenStaffId(row.member.id);
              else if (openStaffId === row.member.id) setOpenStaffId(null);
            }}
            key={row.member.id}
          >
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{row.member.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {new Date(`${month}-01T12:00:00Z`).toLocaleDateString(
                      "es-CL",
                      { month: "long", year: "numeric" },
                    )}{" "}
                    · {row.eventRows.length} eventos
                  </p>
                </div>
                <StatusBadge
                  label={
                    row.outstanding === 0 && row.finalAmount
                      ? "Pagado"
                      : row.paid
                        ? "Pago parcial"
                        : "Pendiente"
                  }
                  variant={
                    row.outstanding === 0 && row.finalAmount
                      ? "success"
                      : row.paid
                        ? "info"
                        : "warning"
                  }
                />
              </div>
              <p className="mt-4 text-xs text-muted">Abre el colaborador para ver el resumen financiero canónico y el detalle trazable.</p>
              <p className="mt-3 text-xs font-semibold text-brand">
                Ver liquidación
              </p>
            </summary>
            <div className="mt-4 space-y-3">
              <AdminFinanceSummary
                row={row}
                reimbursements={reimbursementDetails.filter((item) => item.staffId === row.member.id)}
              />
              {row.account && (
                <StaffMonthlyAccountPanel
                  account={row.account}
                  mode="FOUNDER"
                  onBack={() => setOpenStaffId(null)}
                />
              )}
              {[...row.eventRows].sort((a,b) => a.eventDate.localeCompare(b.eventDate) || a.eventTime.localeCompare(b.eventTime) || a.id.localeCompare(b.id)).map((item) => (
                <EventRow item={item} key={item.id} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function QuickStaffPayment({
  rows,
}: {
  rows: Array<{ member: StaffPaymentMember; eventRows: StaffPaymentEvent[] }>;
}) {
  const [staffId, setStaffId] = useState("");
  const [eventId, setEventId] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const honorariaOutstanding = (event: StaffPaymentEvent) => Math.max(0, event.payrollNet - event.payrollPaidAmount);
  const eligibleRows = rows.map((item) => ({ ...item, eventRows: item.eventRows.filter((event) => honorariaOutstanding(event) > 0) })).filter((item) => item.eventRows.length > 0);
  const row = eligibleRows.find((item) => item.member.id === staffId);
  const event = row?.eventRows.find((item) => item.id === eventId);
  const outstanding = event ? honorariaOutstanding(event) : 0;
  const eligible = Boolean(event && outstanding > 0 && event.status === "CONFIRMED");
  const submit = (form: FormData) => start(async () => {
    const result = await registerQuickStaffSettlementPaymentAction(form);
    setMessage(result.ok ? "Abono registrado en la liquidación canónica." : result.error);
    if (result.ok) { setStaffId(""); setEventId(""); }
  });
  return (
    <section className="rounded-2xl border border-brand/25 bg-brand/5 p-4 sm:p-5" data-issue79-quick-obligations>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Pago rápido de honorarios</p><h3 className="mt-1 text-lg font-semibold">Operador → evento pendiente → pagar</h3><p className="mt-1 text-sm text-muted">Solo muestra honorarios canónicos verificables; reembolsos y gastos pagados permanecen fuera.</p></div>
        <span className="shrink-0 rounded-full border border-brand/30 px-2 py-1 text-xs font-semibold text-brand">Founder/Admin</span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-end">
        <label className="text-sm">Operador<select className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" value={staffId} onChange={(e) => { setStaffId(e.target.value); setEventId(""); }}><option value="">Seleccionar operador</option>{eligibleRows.map((item) => <option key={item.member.id} value={item.member.id}>{item.member.name}</option>)}</select></label>
        <label className="text-sm">Evento pendiente<select className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" disabled={!row} value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">Seleccionar obligación pendiente</option>{row?.eventRows.map((item) => <option key={item.id} value={item.id}>{item.eventName} · {item.eventDate} · {item.roles.map(roleLabel).join(" + ")} · {money.format(honorariaOutstanding(item))}</option>)}</select></label>
        <span className="min-h-11 rounded-xl border bg-background/60 px-3 py-2 text-sm"><span className="block text-xs text-muted">Saldo real pendiente</span><strong>{event ? money.format(outstanding) : "—"}</strong></span>
      </div>
      {event ? <form action={submit} className="mt-4 grid gap-3 rounded-xl border bg-background/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input name="settlementId" type="hidden" value={event.id} /><input name="reference" type="hidden" value={`Pago Staff · ${event.eventName} · ${event.roles.map(roleLabel).join(" + ")}`} />
        <label className="text-sm">Monto a pagar<input className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" defaultValue={outstanding} min="1" max={outstanding} name="amount" required step="1" type="number" /><span className="mt-1 block text-xs text-muted">Saldo de honorarios verificable: {money.format(outstanding)}</span></label>
        <label className="text-sm">Fecha<input className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" name="paymentDate" required type="date" /></label>
        <label className="text-sm">Método<input className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" name="method" required placeholder="Transferencia" /></label>
        <label className="text-sm sm:col-span-2">Boleta / comprobante<input accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block min-h-11 w-full text-sm" name="file" required type="file" /></label>
        <button className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-foreground disabled:opacity-60 sm:col-span-2 lg:col-span-4" disabled={pending || !eligible} type="submit">{pending ? "Registrando…" : eligible ? "OK / PAGAR Y REGISTRAR COMPROBANTE" : "Revisión canónica pendiente"}</button>
      </form> : null}
      {event ? <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">Honorarios pendientes: {money.format(outstanding)} · Reembolsos y gastos pagados quedan fuera de este selector. {eligible ? "La liquidación del evento está disponible." : "La liquidación canónica no coincide; el pago rápido permanece bloqueado."}</p> : null}
      {message ? <p aria-live="polite" className="mt-3 text-sm text-muted">{message}</p> : null}
    </section>
  );
}

type DriveSyncStatus = "PENDING" | "SYNCED" | "PARTIAL" | "ERROR";
type DriveSyncItem = {
  kind: "EXPENSE" | "REIMBURSEMENT" | "PAYMENT";
  sourceId: string;
  status: "SYNCED" | "REQUIRES_REVIEW" | "ERROR";
  staff?: string;
  event?: string;
  amount?: number;
  reason?: string;
};
type DriveSyncSummary = {
  processed: number;
  synced: number;
  requiresReview: number;
  errors: number;
  results: DriveSyncItem[];
};

function StaffFinanceDriveSync() {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<DriveSyncStatus>("PENDING");
  const [summary, setSummary] = useState<DriveSyncSummary | null>(null);
  const [message, setMessage] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const runSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/google-drive/staff-finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "2026-08-01", to: "2026-10-01" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        processed?: number;
        synced?: number;
        requiresReview?: number;
        results?: DriveSyncItem[];
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "No fue posible sincronizar documentos Staff.");
      }
      const results = data.results ?? [];
      const next = {
        processed: Number(data.processed ?? results.length),
        synced: Number(data.synced ?? results.filter((item) => item.status === "SYNCED").length),
        requiresReview: Number(data.requiresReview ?? results.filter((item) => item.status === "REQUIRES_REVIEW").length),
        errors: results.filter((item) => item.status === "ERROR").length,
        results,
      };
      setSummary(next);
      setDetailsOpen(false);
      setStatus(next.errors > 0 ? "ERROR" : next.requiresReview > 0 ? (next.synced > 0 ? "PARTIAL" : "ERROR") : "SYNCED");
      setMessage("Sincronización finalizada.");
    } catch (error) {
      setStatus("ERROR");
      setMessage(error instanceof Error ? error.message : "No fue posible sincronizar documentos Staff.");
    } finally {
      setSyncing(false);
    }
  };
  const statusVariant = status === "SYNCED" ? "success" : status === "ERROR" ? "danger" : "warning";
  const kindLabel = { EXPENSE: "GASTO ORIGINAL", REIMBURSEMENT: "REEMBOLSO PAGADO", PAYMENT: "COMPROBANTE PAGO" } as const;
  return (
    <section className="rounded-2xl border border-brand/30 bg-brand/5 p-4" data-staff-drive-sync>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">GOOGLE DRIVE · RESPALDO DOCUMENTAL</p>
          <p className="mt-1 text-sm text-muted">Sincroniza gastos, reembolsos y comprobantes de pago Staff con Google Drive.</p>
        </div>
        <StatusBadge label={status} variant={statusVariant} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground" aria-busy={syncing} disabled={syncing} onClick={runSync} type="button">
          {syncing ? "Sincronizando documentos Staff con Google Drive…" : "SINCRONIZAR DOCUMENTOS A DRIVE"}
        </button>
        {summary ? <button className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold" onClick={() => setDetailsOpen((value) => !value)} type="button">{detailsOpen ? "OCULTAR DETALLE" : "VER DETALLE"}</button> : null}
      </div>
      {summary ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><DriveMetric label="Procesados" value={summary.processed} /><DriveMetric label="Sincronizados" value={summary.synced} /><DriveMetric label="Requieren revisión" value={summary.requiresReview} /><DriveMetric label="Errores" value={summary.errors} /></div> : null}
      {message ? <p aria-live="polite" className="mt-3 rounded-xl border p-3 text-sm text-muted">{message}</p> : null}
      {detailsOpen && summary ? <div className="mt-4 space-y-2">{summary.results.map((item) => <article className="rounded-xl border bg-background/60 p-3 text-sm" key={`${item.kind}-${item.sourceId}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{item.staff || "Staff no identificado"} · {item.event || "Evento no identificado"}</p><p className="mt-1 text-xs text-muted">{kindLabel[item.kind]}{typeof item.amount === "number" ? ` · ${money.format(item.amount)}` : ""}</p></div><StatusBadge label={item.status === "SYNCED" ? "SYNCED" : item.status === "ERROR" ? "ERROR" : "REQUIERE REVISIÓN"} variant={item.status === "SYNCED" ? "success" : item.status === "ERROR" ? "danger" : "warning"} /></div>{item.reason ? <p className="mt-2 text-xs text-muted">{item.reason}</p> : null}</article>)}</div> : null}
    </section>
  );
}

function DriveMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-background/50 p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}

function PaymentSheet({
  month,
  rows,
}: {
  month: string;
  rows: Array<{ member: StaffPaymentMember; account?: StaffMonthlyAccount }>;
}) {
  const [chosen, setChosen] = useState<{
      member: StaffPaymentMember;
      account: StaffMonthlyAccount;
    } | null>(null),
    [pending, start] = useTransition(),
    [message, setMessage] = useState(""),
    router = useRouter();
  const payable = rows
      .filter((row) => row.account)
      .map((row) => ({ member: row.member, account: row.account! })),
    total = payable.reduce(
      (sum, row) =>
        sum +
        (row.account.boletaStatus === "APPROVED" &&
        row.account.paymentStatus === "READY_TO_PAY"
          ? row.account.finalTransferAmount
          : 0),
      0,
    );
  const submit = async (form: FormData) => {
    start(async () => {
      const result = await registerMonthlyStaffPaymentAction(form);
      setMessage(result.message);
      if (result.ok) {
        setChosen(null);
        router.refresh();
      }
    });
  };
  return (
    <section className="rounded-2xl border bg-background/40 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
            Planilla de pagos Staff
          </p>
          <h3 className="mt-1 text-xl font-semibold capitalize">
            {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("es-CL", {
              month: "long",
              year: "numeric",
            })}
          </h3>
        </div>
        <button
          className="min-h-11 rounded-xl border px-4 text-sm font-semibold print:hidden"
          onClick={() => window.print()}
          type="button"
        >
          Imprimir planilla
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:hidden">
        {payable.map(({ member, account }) => (
          <article className="rounded-xl border bg-card p-4" key={account.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{member.name}</p>
                <p className="text-sm text-muted">
                  {new Date(`${month}-01T12:00:00Z`).toLocaleDateString(
                    "es-CL",
                    { month: "long", year: "numeric" },
                  )}
                </p>
              </div>
              <strong>
                {account.paymentStatus === "PAID"
                  ? "PAGADO ✓"
                  : account.paymentStatus === "READY_TO_PAY"
                    ? money.format(account.finalTransferAmount)
                    : "BLOQUEADO"}
              </strong>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted">Total generado</dt>
                <dd className="font-semibold">
                  {money.format(account.workNet)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Adelantos</dt>
                <dd className="font-semibold">
                  -{money.format(account.advancesTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Reembolsos</dt>
                <dd className="font-semibold">
                  {money.format(account.reimbursementsTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Total liquidación</dt>
                <dd className="font-semibold">
                  {money.format(account.workNet + account.reimbursementsTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Valor con boleta</dt>
                <dd className="font-semibold">
                  {money.format(account.boletaGross)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Valor a depositar</dt>
                <dd className="font-semibold">
                  {money.format(account.finalTransferAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Estado boleta</dt>
                <dd className="font-semibold">{boletaLabel(account)}</dd>
              </div>
              <div>
                <dt className="text-muted">Estado pago</dt>
                <dd className="font-semibold">{paymentLabel(account)}</dd>
              </div>
            </dl>
            {account.paymentStatus === "READY_TO_PAY" &&
            account.boletaStatus === "APPROVED" ? (
              <button
                className="mt-3 min-h-11 w-full rounded-xl bg-brand px-4 font-semibold text-brand-foreground"
                onClick={() => setChosen({ member, account })}
                type="button"
              >
                Pagar
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider text-muted">
              <th className="p-3">Nombre</th>
              <th className="p-3">Apellido</th>
              <th className="p-3">Mes</th>
              <th className="p-3 text-right">Total generado</th>
              <th className="p-3 text-right">Adelantos</th>
              <th className="p-3 text-right">Reembolsos</th>
              <th className="p-3 text-right">Total liquidación</th>
              <th className="p-3 text-right">Valor con boleta</th>
              <th className="p-3 text-right">Valor a depositar</th>
              <th className="p-3">Estado boleta</th>
              <th className="p-3">Estado pago</th>
              <th className="p-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {payable.map(({ member, account }) => (
              <tr className="border-b" key={account.id}>
                <td className="p-3 font-semibold">
                  {splitName(member.name).firstName}
                </td>
                <td className="p-3 font-semibold">
                  {splitName(member.name).lastName}
                </td>
                <td className="p-3">{month}</td>
                <td className="p-3 text-right">
                  {money.format(account.workNet)}
                </td>
                <td className="p-3 text-right">
                  -{money.format(account.advancesTotal)}
                </td>
                <td className="p-3 text-right">
                  {money.format(account.reimbursementsTotal)}
                </td>
                <td className="p-3 text-right">
                  {money.format(account.workNet + account.reimbursementsTotal)}
                </td>
                <td className="p-3 text-right">
                  {money.format(account.boletaGross)}
                </td>
                <td className="p-3 text-right font-semibold">
                  {money.format(account.finalTransferAmount)}
                </td>
                <td className="p-3">{boletaLabel(account)}</td>
                <td className="p-3">{paymentLabel(account)}</td>
                <td className="p-3">
                  {account.paymentStatus === "READY_TO_PAY" &&
                  account.boletaStatus === "APPROVED" ? (
                    <button
                      className="min-h-11 rounded-xl bg-brand px-3 font-semibold text-brand-foreground"
                      onClick={() => setChosen({ member, account })}
                      type="button"
                    >
                      Pagar
                    </button>
                  ) : account.paymentStatus === "PAID" ? (
                    "Ver comprobante"
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-col gap-1 rounded-xl bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <strong>TOTAL GENERAL A DEPOSITAR</strong>
        <strong className="text-2xl text-brand">{money.format(total)}</strong>
      </div>
      {message ? (
        <p aria-live="polite" className="mt-3 text-sm text-muted">
          {message}
        </p>
      ) : null}
      {chosen ? (
        <MobileDialog
          eyebrow="Payment Ledger · Staff"
          title="REGISTRAR PAGO STAFF"
          description={`${chosen.member.name} · ${month}`}
          onClose={() => !pending && setChosen(null)}
        >
          <form action={submit} className="space-y-3">
            <p className="text-sm">
              ¿Confirmas el pago de{" "}
              {money.format(chosen.account.finalTransferAmount)} correspondiente
              a {month} para {chosen.member.name}?
            </p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted">Total trabajado</dt>
                <dd className="font-semibold">
                  {money.format(chosen.account.workNet)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Boleta SII</dt>
                <dd className="font-semibold">APROBADA ✓</dd>
              </div>
              <div>
                <dt className="text-muted">Adelantos realizados</dt>
                <dd className="font-semibold">
                  {money.format(chosen.account.advancesTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Saldo final a pagar</dt>
                <dd className="font-semibold">
                  {money.format(chosen.account.finalTransferAmount)}
                </dd>
              </div>
            </dl>
            <input name="accountId" type="hidden" value={chosen.account.id} />
            <input
              name="staffId"
              type="hidden"
              value={chosen.account.staffId}
            />
            <input name="month" type="hidden" value={month} />
            <input
              name="amount"
              type="hidden"
              value={chosen.account.finalTransferAmount}
            />
            <label className="block text-sm">
              Fecha de pago
              <input
                className="mt-1 min-h-11 w-full rounded-xl border px-3"
                name="paymentDate"
                required
                type="date"
              />
            </label>
            <label className="block text-sm">
              Método
              <input
                className="mt-1 min-h-11 w-full rounded-xl border px-3"
                name="method"
                required
              />
            </label>
            <label className="block text-sm">
              Referencia
              <input
                className="mt-1 min-h-11 w-full rounded-xl border px-3"
                name="reference"
                value="Pago mensual Staff"
                readOnly
              />
            </label>
            <label className="block text-sm font-semibold">
              ADJUNTAR COMPROBANTE DE PAGO
              <input
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="mt-1 block w-full text-sm"
                name="file"
                required
                type="file"
              />
            </label>
            <Button
              className="w-full"
              loading={pending}
              loadingLabel="Registrando y notificando…"
              type="submit"
            >
              REGISTRAR PAGO
            </Button>
          </form>
        </MobileDialog>
      ) : null}
    </section>
  );
}
function EventRow({ item }: { item: StaffPaymentEvent }) {
  return (
    <article className="rounded-xl border p-3 text-sm">
      <div className="flex justify-between gap-3">
        <div>
          <strong>{item.eventName}</strong>
          <p className="mt-1 text-xs text-muted">
            {item.eventDate} · {item.customer}
          </p>
          <p className="mt-1 text-xs text-muted">
            {item.service} · {item.durationHours} horas · {item.roles.map(roleLabel).join(" + ")}
            {item.blockName ? ` · ${item.blockName}${item.blockStartAt && item.blockEndAt ? ` · ${item.blockStartAt.slice(11,16)}–${item.blockEndAt.slice(11,16)}` : ""}` : ""}
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
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <Box label="Original" value={money.format(item.originalNet)} />
        <Box label="Ajustes" value={money.format(item.adjustmentTotal)} />
        <Box
          label="Reembolsos aprobados"
          value={money.format(item.reimbursementTotal)}
        />
        <Box
          label="Reembolsos pagados"
          value={money.format(item.reimbursementPaidAmount)}
        />
        <Box
          label="Reembolsos pendientes"
          value={money.format(item.reimbursementPendingAmount)}
        />
        <Box label="Monto final" value={money.format(item.finalAmount)} />
        <Box label="Anticipo / pagado" value={money.format(item.paidAmount)} />
        <Box
          label="Saldo total"
          value={money.format(
            Math.max(0, item.payrollNet - item.payrollPaidAmount) +
              item.reimbursementPendingAmount,
          )}
        />
      </div>
      <p
        className={`mt-3 flex items-center gap-2 text-xs font-semibold ${item.receiptStatus === "RECEIVED" ? "text-emerald-500" : "text-amber-500"}`}
      >
        <TriangleAlert className="size-4" />
        {item.receiptStatus === "RECEIVED"
          ? "Boleta recibida"
          : "Boleta pendiente"}
      </p>
      <a
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand"
        href={`/projects/${item.projectId}#staff-assignment`}
      >
        <ExternalLink className="size-3.5" />
        Abrir liquidación en Evento
      </a>
    </article>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  const financial =
    !label.startsWith("Boletas") && label !== "Eventos trabajados";
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">
        {financial ? money.format(value) : value}
      </dd>
    </div>
  );
}
function Box({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-background/50 p-2">
      {label}
      <br />
      <b>{value}</b>
    </span>
  );
}

"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { OrbitDocumentViewer } from "@/components/documents/orbit-document-viewer";
import {
  approveMonthlySettlementReviewAction,
  completeSettlementEventAction,
  finalizeMonthlyStaffAccountAction,
  registerMonthlyStaffPaymentAction,
  registerStaffAdvanceAction,
  reviewMonthlyBoletaAction,
  submitMonthlyBoletaAction,
} from "./actions";
import { staffMonthLabel, type StaffMonthlyAccount } from "./model";
const money = (v: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(v);
const boletaLabel = {
  PENDING: "Pendiente",
  RECEIVED: "En revisión",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};
const paymentLabel = {
  PENDING: "Bloqueado",
  READY_TO_PAY: "Listo para pagar",
  PAID: "Pagado",
};
export function StaffMonthlyAccountPanel({
  account,
  mode,
  onBack,
}: {
  account: StaffMonthlyAccount;
  mode: "FOUNDER" | "STAFF";
  onBack?: () => void;
}) {
  const [pending, start] = useTransition(),
    [message, setMessage] = useState(""),
    [completing, setCompleting] = useState<string | null>(null),
    [completed, setCompleted] = useState<Set<string>>(new Set()),
    [paymentMethod, setPaymentMethod] = useState("TRANSFERENCIA"),
    [confirming, setConfirming] = useState<{
      projectId: string;
      event: string;
    } | null>(null),
    [viewerOpen, setViewerOpen] = useState(false);
  const [advanceFor, setAdvanceFor] = useState<{ settlementId: string; event: string; projectId: string } | null>(null);
  const completionLock = useRef(false);
  const [advanceSelection, setAdvanceSelection] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState("TRANSFERENCIA");
  const router = useRouter();
  const [financeContext, setFinanceContext] = useState<StaffFinanceContext | null>(null);
  useEffect(() => {
    if (mode !== "STAFF") return;
    fetch("/api/staff-portal/finance/context", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((value: StaffFinanceContext | null) => setFinanceContext(value)).catch(() => setFinanceContext(null));
  }, [mode]);
  if (String(mode) === "STAFF") return <StaffFinanceAccountView account={account} context={financeContext} />;
  const confirmCompletion = () => {
    if (!confirming || completionLock.current) return;
    completionLock.current = true;
    const item = confirming;
    const correlationId = `CMP-${item.projectId}-${Date.now()}`;
    setConfirming(null);
    setCompleting(item.projectId);
    start(async () => {
      const result = await completeSettlementEventAction(
        item.projectId,
        correlationId,
      );
      setCompleting(null);
      completionLock.current = false;
      setMessage(
        result.ok
          ? "✓ Evento marcado como completado"
          : `${result.message} Referencia ${result.correlationId || correlationId}`,
      );
      if (result.ok) {
        setCompleted((prev) => new Set(prev).add(item.projectId));
        router.refresh();
      }
    });
  };
  const run =
    (action: (f: FormData) => Promise<{ ok: boolean; message: string }>) =>
    (form: FormData) =>
      start(async () => {
        const result = await action(form);
        setMessage(result.message);
      });
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border bg-card p-4 sm:p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
            Liquidación mensual Staff
          </p>
          <h3 className="mt-1 text-lg font-semibold capitalize">
            {staffMonthLabel(account.month)}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {account.eventCount}{" "}
            {account.eventCount === 1 ? "servicio" : "servicios"} · tarifas
            NETAS pactadas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBack ? (
            <button
              aria-label="Volver a liquidaciones mensuales"
              className="inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold"
              onClick={onBack}
              type="button"
            >
              ← Volver
            </button>
          ) : null}
          <StatusBadge
            label={`Boleta: ${boletaLabel[account.boletaStatus]}`}
            variant={
              account.boletaStatus === "APPROVED"
                ? "success"
                : account.boletaStatus === "REJECTED"
                  ? "danger"
                  : "warning"
            }
          />
          <StatusBadge
            label={`Pago: ${paymentLabel[account.paymentStatus]}`}
            variant={
              account.paymentStatus === "PAID"
                ? "success"
                : account.paymentStatus === "READY_TO_PAY"
                  ? "info"
                  : "warning"
            }
          />
        </div>
      </header>
      {account.reviewRequired ? (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold text-amber-700">
            Revisión Founder requerida
          </p>
          <p className="mt-1 text-amber-800/90">
            {account.reviewReason ||
              "La liquidación tiene una inconsistencia operacional que debe revisarse antes de pagar."}
          </p>
          {mode === "FOUNDER" ? (
            <form
              action={run(approveMonthlySettlementReviewAction)}
              className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <input name="accountId" type="hidden" value={account.id} />
              <input
                aria-label="Motivo de aprobación Founder"
                className="min-h-11 min-w-0 rounded-xl border border-amber-500/40 bg-background px-3"
                defaultValue={
                  account.reviewReason ||
                  "Revisión operacional validada por Founder"
                }
                name="reason"
                required
              />
              <Button aria-busy={pending} disabled={pending} type="submit">
                Revisar y aprobar
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
      {account.calculation.blockingEvents.length ||
      account.calculation.details.length ? (
        <section className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <h4 className="font-semibold text-amber-700">Eventos del mes</h4>
          <p className="mt-1 text-sm text-muted">
            Completados: {account.calculation.details.length} · Pendientes de
            completar: {account.calculation.blockingEvents.length}
          </p>
          <div className="mt-3 space-y-2">
            {account.calculation.details.map((item) => (
              <article
                className="rounded-lg border bg-background p-3 text-sm"
                key={item.settlementId}
              >
                <p className="font-semibold">
                  {item.eventDate} · {item.event}
                </p>
                <p className="mt-1 text-muted">{item.service} · COMPLETADO ✓</p>
                {mode === "FOUNDER" ? (
                  <button
                    className="mt-2 inline-flex min-h-11 items-center rounded-xl border px-3 font-semibold text-brand"
                    onClick={() => setAdvanceFor({ settlementId: item.settlementId, event: item.event, projectId: item.projectId })}
                    type="button"
                  >
                    [ADELANTO PAGO]
                  </button>
                ) : null}
              </article>
            ))}
            {account.calculation.blockingEvents.map((item) => (
              <article
                className="rounded-lg border bg-background p-3 text-sm"
                key={item.settlementId}
              >
                <p className="font-semibold">{item.eventId}</p>
                <p className="mt-1">
                  {item.eventDate} · {item.event}
                </p>
                <p className="mt-1 text-muted">
                  {item.service} · Estado operativo: {item.status}
                </p>
                {mode === "FOUNDER" && !completed.has(item.projectId) && (
                  <button
                    className="mt-2 inline-flex min-h-11 items-center rounded-xl border px-3 font-semibold text-brand"
                    aria-busy={pending} disabled={pending|| completing === item.projectId}
                    onClick={() =>
                      setConfirming({
                        projectId: item.projectId,
                        event: item.event,
                      })
                    }
                    type="button"
                  >
                    {completing === item.projectId
                      ? "Completando…"
                      : "Marcar completado"}
                  </button>
                )}
                {mode === "FOUNDER" ? (
                  <button
                    className="ml-3 mt-2 inline-flex min-h-11 items-center rounded-xl border px-3 font-semibold text-brand"
                    onClick={() => setAdvanceFor({ settlementId: item.settlementId, event: item.event, projectId: item.projectId })}
                    type="button"
                  >
                    [ADELANTO PAGO]
                  </button>
                ) : null}
                <a
                  className="ml-3 mt-2 inline-flex min-h-11 items-center font-semibold text-brand"
                  href={`/projects/${item.projectId}`}
                >
                  Abrir Evento →
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="Total trabajado" value={account.workNet} />
        <Metric
          label="Retención"
          value={account.withholdingAmount}
          note={`${account.withholdingRate.toLocaleString("es-CL")}%`}
        />
        <Metric label="Líquido según boleta" value={account.boletaNet} />
        <Metric label="Adelantos realizados" value={-account.advancesTotal} />
        <Metric label="Reembolsos aprobados" value={account.reimbursementsTotal} />
        <Metric label="Reembolsos pagados" value={account.reimbursementsPaidTotal} />
        <Metric label="Reembolsos pendientes" value={account.reimbursementsPendingTotal} />
        <Metric
          label="Saldo honorarios a transferir"
          value={account.finalTransferAmount}
        />
      </dl>
      {account.reimbursementsTotal > 0 ? <p className="mt-3 rounded-xl border border-brand/25 bg-brand/5 p-3 text-sm">Los reembolsos se pagan y trazan por separado de honorarios y adelantos. Pendiente: <strong>{money(account.reimbursementsPendingTotal)}</strong>.</p> : null}
      {mode === "FOUNDER" ? (
        <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
          <p className="text-sm font-semibold">Adelantos realizados: {money(account.advancesTotal)}</p>
          {account.calculation.details.length + account.calculation.blockingEvents.length === 1 ? (
            <button
              className="inline-flex min-h-11 items-center rounded-xl border px-3 font-semibold text-brand"
              onClick={() => {
                const item = account.calculation.details[0] ?? account.calculation.blockingEvents[0];
                if (item) setAdvanceFor({ settlementId: item.settlementId, event: item.event, projectId: item.projectId });
              }}
              type="button"
            >
              + REGISTRAR ADELANTO
            </button>
          ) : account.calculation.details.length + account.calculation.blockingEvents.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Evento para adelanto" className="min-h-11 rounded-xl border bg-background px-3 text-sm" value={advanceSelection} onChange={(event) => setAdvanceSelection(event.target.value)}>
                <option value="">Selecciona Evento</option>
                {[...account.calculation.details, ...account.calculation.blockingEvents].map((item) => <option key={item.settlementId} value={item.settlementId}>{item.eventDate} · {item.event}</option>)}
              </select>
              <button className="inline-flex min-h-11 items-center rounded-xl border px-3 font-semibold text-brand" disabled={!advanceSelection} onClick={() => { const item = [...account.calculation.details, ...account.calculation.blockingEvents].find((entry) => entry.settlementId === advanceSelection); if (item) setAdvanceFor({ settlementId: item.settlementId, event: item.event, projectId: item.projectId }); }} type="button">+ REGISTRAR ADELANTO</button>
            </div>
          ) : null}
        </section>
      ) : null}
      <div className="mt-4 rounded-2xl border-2 border-brand bg-brand/5 p-4">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-brand">
          Monto total boleta SII a emitir
        </p>
        <p className="mt-2 break-words text-3xl font-bold tabular-nums">
          {money(account.boletaGross)}
        </p>
        <p className="mt-2 text-sm text-muted">
          Este es el monto exacto que debes ingresar al emitir tu Boleta de
          Honorarios en SII.
        </p>
      </div>
      {mode === "STAFF" && account.calculation.details.some((item) => item.advances > 0) ? (
        <section className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <h4 className="font-semibold text-emerald-700">Adelantos recibidos</h4>
          <div className="mt-2 space-y-2 text-sm">
            {account.calculation.details.filter((item) => item.advances > 0).map((item) => (
              <div className="flex flex-wrap justify-between gap-2" key={item.settlementId}>
                <span>{item.eventDate} · {item.event}</span><strong>{money(item.advances)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {account.excessAdvance > 0 ? (
        <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm font-semibold text-red-600">
          Exceso de adelanto: {money(account.excessAdvance)}. No se generará una
          transferencia negativa.
        </p>
      ) : null}
      {account.calculation.details.length ? (
        <details className="mt-4 rounded-xl border p-3">
          <summary className="cursor-pointer font-semibold">
            Detalle de servicios realizados
          </summary>
          <div className="mt-3 space-y-2">
            {account.calculation.details.map((item) => (
              <article
                className="rounded-lg bg-background p-3 text-sm"
                key={item.settlementId}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                  <strong>
                    {item.eventDate} · {item.service}
                  </strong>
                  <strong>{money(item.workNet)}</strong>
                </div>
                <p className="mt-1 break-words text-muted">
                  {item.event} · {item.location || "Lugar no informado"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {item.roles.join(" + ")} · {item.hours} horas
                  {item.advances > 0
                    ? ` · Adelanto ${money(item.advances)}`
                    : ""}
                </p>
              </article>
            ))}
          </div>
        </details>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold"
          onClick={() => setViewerOpen(true)}
          type="button"
        >
          Ver liquidación PDF
        </button>
        {mode === "FOUNDER" && account.boletaDocumentId ? (
          <a
            className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold"
            href={`/api/staff-monthly-accounts/${account.id}/boleta`}
            target="_blank"
          >
            Ver boleta
          </a>
        ) : null}
      </div>
      {viewerOpen ? (
        <OrbitDocumentViewer
          onClose={() => setViewerOpen(false)}
          src={`/api/staff-monthly-accounts/${account.id}/settlement-pdf`}
          title={`Liquidación ${staffMonthLabel(account.month)}`}
        />
      ) : null}
      {advanceFor ? (
        <MobileDialog
          eyebrow="Liquidación Staff"
          title="Registrar adelanto"
          description={`${advanceFor.event} · asociado al Evento seleccionado`}
          onClose={() => !pending && setAdvanceFor(null)}
          size="lg"
        >
          <form
            action={(form) =>
              start(async () => {
                const result = await registerStaffAdvanceAction(form);
                setMessage(result.message);
                if (result.ok) { setAdvanceFor(null); setAdvanceMethod("TRANSFERENCIA"); }
                if (result.ok) router.refresh();
              })
            }
            className="grid gap-3"
          >
            <input name="settlementId" type="hidden" value={advanceFor.settlementId} />
            <label className="text-sm">Monto adelanto *<input className="mt-1 min-h-11 w-full rounded-xl border px-3" min="1" name="amount" required type="number" /></label>
            <label className="text-sm">Fecha *<input className="mt-1 min-h-11 w-full rounded-xl border px-3" name="date" required type="date" /></label>
            <label className="text-sm">Método *<select className="mt-1 min-h-11 w-full rounded-xl border px-3" value={advanceMethod} onChange={(event) => setAdvanceMethod(event.target.value)} name="method" required><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="OTRO">Otro</option></select>{advanceMethod === "OTRO" ? <input className="mt-2 min-h-11 w-full rounded-xl border px-3" name="methodOther" placeholder="Indica el método" required /> : null}</label>
            <label className="text-sm">Referencia / nota<textarea className="mt-1 min-h-20 w-full rounded-xl border px-3" name="notes" /></label>
            <label className="text-sm">Comprobante de pago *<input accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" name="receipt" required type="file" /></label>
            <label className="text-sm">Boleta de honorarios (opcional)<input accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" name="boleta" type="file" /></label>
            <Button aria-busy={pending} disabled={pending} type="submit">{pending ? "Registrando…" : "Registrar adelanto"}</Button>
          </form>
        </MobileDialog>
      ) : null}
      {mode === "FOUNDER" && account.settlementStatus === "DRAFT" ? (
        <form action={run(finalizeMonthlyStaffAccountAction)} className="mt-4">
          <input name="accountId" type="hidden" value={account.id} />
          <Button aria-busy={pending} disabled={pending|| account.reviewRequired}>
            Finalizar liquidación
          </Button>
        </form>
      ) : null}
      {mode === "STAFF" &&
      account.calculation.blockingEvents.length === 0 &&
      account.boletaGross > 0 &&
      account.boletaStatus !== "APPROVED" &&
      account.paymentStatus !== "PAID" ? (
        <form
          action={run(submitMonthlyBoletaAction)}
          className="mt-4 space-y-3"
        >
          <p className="text-sm">
            Emite tu Boleta de Honorarios en SII por exactamente{" "}
            <strong>{money(account.boletaGross)}</strong> y súbela aquí para
            revisión.
          </p>
          <input name="month" type="hidden" value={account.month.slice(0, 7)} />
          <label className="block text-sm font-medium">
            Boleta SII
            <input
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-1 block w-full text-sm"
              name="file"
              required
              type="file"
            />
          </label>
          <Button aria-busy={pending} disabled={pending} type="submit">
            {account.boletaStatus === "REJECTED"
              ? "Subir boleta corregida"
              : "Subir boleta SII"}
          </Button>
        </form>
      ) : null}
      {mode === "STAFF" && account.boletaStatus === "RECEIVED" ? (
        <p className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700">
          ✓ Boleta recibida · Pendiente de revisión
        </p>
      ) : null}
      {account.rejectionReason ? (
        <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">
          Boleta rechazada · Motivo: {account.rejectionReason}
        </p>
      ) : null}
      {mode === "STAFF" && account.paymentStatus === "PAID" ? (
        <div className="mt-4">
          <p className="font-semibold">PAGADO · {money(account.paidAmount)}</p>
          <p className="text-sm text-muted">Fecha {account.paidAt}</p>
          {account.receiptDocumentId ? (
            <a
              className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand"
              href={`/api/staff-monthly-accounts/${account.id}/receipt`}
            >
              Ver comprobante de pago
            </a>
          ) : null}
        </div>
      ) : null}
      {mode === "FOUNDER" && account.boletaStatus === "RECEIVED" ? (
        <form
          action={run(reviewMonthlyBoletaAction)}
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
        >
          <input name="accountId" type="hidden" value={account.id} />
          <input
            className="min-h-11 min-w-0 rounded-xl border px-3"
            name="reason"
            placeholder="Motivo obligatorio si rechazas"
          />
          <Button aria-busy={pending} disabled={pending} name="action" value="APPROVE">
            Aprobar
          </Button>
          <Button
            aria-busy={pending} disabled={pending}
            name="action"
            value="REJECT"
            variant="outline"
          >
            Rechazar
          </Button>
        </form>
      ) : null}
      {mode === "FOUNDER" && account.paymentStatus === "READY_TO_PAY" && !account.reviewRequired ? (
        <form
          action={run(registerMonthlyStaffPaymentAction)}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <input name="accountId" type="hidden" value={account.id} />
          <input name="staffId" type="hidden" value={account.staffId} />
          <input name="month" type="hidden" value={account.month.slice(0, 7)} />
          <input
            name="amount"
            type="hidden"
            value={account.finalTransferAmount}
          />
          <label className="text-sm">
            Fecha de pago
            <input
              className="mt-1 min-h-11 w-full rounded-xl border px-3"
              name="paymentDate"
              required
              type="date"
            />
          </label>
          <label className="text-sm">
            Método
            <select
              className="mt-1 min-h-11 w-full rounded-xl border px-3"
              name="method"
              required
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="OTRO">Otro</option>
            </select>
            {paymentMethod === "OTRO" ? (
              <input
                className="mt-2 min-h-11 w-full rounded-xl border px-3"
                name="methodOther"
                placeholder="Indica el método"
                required
              />
            ) : null}
            <input name="reference" type="hidden" value="Pago mensual Staff" />
          </label>
          <label className="text-sm sm:col-span-2">
            Comprobante requerido
            <input
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-1 block w-full"
              name="file"
              required
              type="file"
            />
          </label>
          <Button className="sm:col-span-2" aria-busy={pending} disabled={pending}>
            Registrar pago · {money(account.finalTransferAmount)}
          </Button>
        </form>
      ) : null}
      {message ? (
        <p
          aria-live="polite"
          className="mt-3 rounded-xl border p-3 text-sm text-muted"
        >
          {message}
        </p>
      ) : null}
      {confirming ? (
        <MobileDialog
          eyebrow="Liquidación mensual Staff"
          title="¿Marcar evento como completado?"
          description={confirming.event}
          onClose={() => !pending && setConfirming(null)}
          footer={
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="min-h-11 rounded-xl border px-4 font-semibold"
                aria-busy={pending} disabled={pending}
                onClick={() => setConfirming(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-foreground"
                aria-busy={pending} disabled={pending}
                onClick={confirmCompletion}
                type="button"
              >
                {pending ? "Completando…" : "Marcar completado"}
              </button>
            </div>
          }
        >
          <p className="text-sm text-muted">
            Confirma que este evento fue realizado y está operacionalmente
            completado. El saldo del cliente, cobranzas y pagos pendientes
            continuarán activos de forma independiente.
          </p>
        </MobileDialog>
      ) : null}
    </section>
  );
}
type StaffFinanceContext = {
  company: { legalName: string; taxId: string; address: string; city: string } | null;
  closes: Array<{ accounting_month: string; status: string; due_date: string | null; closed_at: string | null; paid_at: string | null }>;
  movements: Array<{ id: string; settlementId: string; month: string; type: string; amount: number; date: string; notes: string }>;
};

function StaffFinanceAccountView({ account, context }: { account: StaffMonthlyAccount; context: StaffFinanceContext | null }) {
  const [pending, start] = useTransition();
  const close = context?.closes.find((item) => item.accounting_month.slice(0, 7) === account.month.slice(0, 7));
  const advances = (context?.movements ?? []).filter((item) => item.month.slice(0, 7) === account.month.slice(0, 7) && item.type === "ADVANCE");
  const boletaLabel = { PENDING: "NO SUBIDA", RECEIVED: "PENDIENTE VALIDACIÓN", APPROVED: "APROBADA", REJECTED: "RECHAZADA" }[account.boletaStatus] ?? account.boletaStatus;
  const closeLabel = close?.status === "PAID" ? "PAGADO" : close?.status === "CLOSED" ? "CERRADO" : "MES ABIERTO";
  const dateLabel = (value: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-CL") : "—";
  return <section className="space-y-4 rounded-3xl border bg-card p-4 sm:p-6" data-staff-finance-center>
    <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">CENTRO FINANCIERO PERSONAL</p><h3 className="mt-1 text-2xl font-semibold capitalize">{staffMonthLabel(account.month)}</h3><p className="mt-1 text-sm text-muted">Todo lo trabajado, rendido y pagado en este mes.</p></div>
      <div className="flex flex-wrap gap-2"><StatusBadge label={closeLabel} variant={close?.status === "PAID" ? "success" : close?.status === "CLOSED" ? "info" : "warning"} /><StatusBadge label={`Boleta · ${boletaLabel}`} variant={account.boletaStatus === "APPROVED" ? "success" : account.boletaStatus === "REJECTED" ? "danger" : "warning"} /></div>
    </header>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><FinanceMetric label="Eventos del mes" value={String(account.eventCount)} /><FinanceMetric label="Total trabajado" value={money(account.workNet)} /><FinanceMetric label="Adelantos" value={`−${money(account.advancesTotal)}`} /><FinanceMetric label="Total final a pagar" value={money(account.finalTransferAmount)} accent /></div>
    <section className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">EVENTOS DEL MES</p><h4 className="mt-1 font-semibold">Detalle de servicios</h4></div><span className="text-sm text-muted">{account.eventCount} servicio{account.eventCount === 1 ? "" : "s"}</span></div><div className="mt-3 space-y-2">{account.calculation.details.map((item) => <article className="grid gap-2 rounded-xl border bg-background p-3 text-sm sm:grid-cols-[1fr_auto]" key={item.settlementId}><div><p className="font-semibold">{dateLabel(item.eventDate)} · {item.event}</p><p className="mt-1 text-muted">{item.service} · {item.roles.join(" + ")} · {item.hours} h</p><p className="mt-1 text-xs text-muted">{item.location || "Lugar no informado"}{item.advances > 0 ? ` · Adelanto ${money(item.advances)}` : ""}</p></div><strong className="sm:text-right">{money(item.workNet)}</strong></article>)}{account.calculation.blockingEvents.map((item) => <article className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm" key={item.settlementId}><p className="font-semibold">{dateLabel(item.eventDate)} · {item.event}</p><p className="mt-1 text-muted">{item.service} · Pendiente de cierre operativo</p></article>)}{!account.calculation.details.length && !account.calculation.blockingEvents.length ? <p className="text-sm text-muted">No hay servicios cerrados en este mes.</p> : null}</div></section>
    <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border p-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">ADELANTOS</p><div className="mt-3 space-y-2 text-sm">{advances.map((item) => <div className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0" key={item.id}><span>{dateLabel(item.date)}{item.notes ? ` · ${item.notes}` : ""}</span><strong>{money(item.amount)}</strong></div>)}{!advances.length ? <p className="text-muted">Sin adelantos registrados este mes.</p> : null}</div><div className="mt-3 flex justify-between border-t pt-3 text-sm font-semibold"><span>Total adelantos</span><span>{money(account.advancesTotal)}</span></div></section><section className="rounded-2xl border p-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">REEMBOLSOS</p><div className="mt-3 grid grid-cols-2 gap-2"><FinanceMetric label="Aprobados" value={money(account.reimbursementsTotal)} /><FinanceMetric label="Pendientes" value={money(account.reimbursementsPendingTotal)} /></div><p className="mt-3 text-xs text-muted">Los reembolsos se mantienen separados de honorarios y adelantos.</p></section></div>
    <section className={`rounded-2xl border p-4 ${close?.status === "CLOSED" || close?.status === "PAID" ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">CIERRE MENSUAL</p><h4 className="mt-1 text-lg font-semibold">{closeLabel}</h4><p className="mt-1 text-sm text-muted">{close?.status === "CLOSED" || close?.status === "PAID" ? `Cerrado${close.closed_at ? ` el ${dateLabel(close.closed_at)}` : ""}.` : "Tu liquidación aún puede recibir movimientos."}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><FinanceMetric label="Trabajado" value={money(account.workNet)} /><FinanceMetric label="Adelantos" value={`−${money(account.advancesTotal)}`} /><FinanceMetric label="Final" value={money(account.finalTransferAmount)} accent /></div></section>
    <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border p-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">DATOS PARA BOLETA</p><dl className="mt-3 space-y-2 text-sm"><FinanceLine label="Razón social" value={context?.company?.legalName ?? "Cargando configuración…"} /><FinanceLine label="RUT" value={context?.company?.taxId ?? "—"} /><FinanceLine label="Dirección" value={context?.company?.address ?? "—"} /><FinanceLine label="Comuna" value={context?.company?.city ?? "—"} /><FinanceLine label="Glosa" value="OPERADOR EVENTOS" /></dl><div className="mt-4 rounded-xl bg-brand/10 p-3"><p className="text-xs text-muted">Monto bruto a emitir</p><p className="mt-1 text-xl font-semibold">{money(account.boletaGross)}</p><p className="mt-1 text-xs text-muted">Retención referencial {account.withholdingRate.toLocaleString("es-CL")}% · líquido {money(account.boletaNet)}</p></div></div><div className="rounded-2xl border p-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">BOLETA DE HONORARIOS</p><p className="mt-2 text-lg font-semibold">{boletaLabel}</p>{account.rejectionReason ? <p className="mt-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{account.rejectionReason}</p> : null}{account.boletaStatus !== "APPROVED" && account.paymentStatus !== "PAID" ? <form action={(form) => start(async () => { await submitMonthlyBoletaAction(form); location.reload(); })} className="mt-4 space-y-3"><input name="month" type="hidden" value={account.month.slice(0, 7)} /><input accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full rounded-xl border bg-background p-2 text-sm" name="file" required type="file" /><Button aria-busy={pending} disabled={pending} type="submit">{account.boletaStatus === "REJECTED" ? "Subir boleta corregida" : "Subir boleta SII"}</Button></form> : null}{account.boletaStatus === "RECEIVED" ? <p className="mt-3 text-sm text-emerald-600">Boleta recibida · pendiente de validación por Administración.</p> : null}</div></section>
    {account.paymentStatus === "PAID" ? <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-600">PAGO REALIZADO</p><p className="mt-2 text-lg font-semibold">{money(account.paidAmount)}</p><p className="mt-1 text-sm text-muted">Fecha {dateLabel(account.paidAt)} · Método {account.paymentMethod || "Transferencia"}</p>{account.receiptDocumentId ? <a className="mt-3 inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold text-brand" href={`/api/staff-monthly-accounts/${account.id}/receipt`}>Ver comprobante</a> : null}</section> : <p className="rounded-xl border p-3 text-sm text-muted">Pago pendiente de completar por Administración.</p>}
  </section>;
}

function FinanceMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="rounded-xl border bg-background/50 p-3"><p className="text-xs text-muted">{label}</p><p className={`mt-1 font-semibold tabular-nums ${accent ? "text-brand" : ""}`}>{value}</p></div>; }
function FinanceLine({ label, value }: { label: string; value: string }) { return <div className="flex flex-col gap-0.5 border-b pb-2 last:border-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-3"><dt className="text-muted">{label}</dt><dd className="font-semibold sm:text-right">{value}</dd></div>; }

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-words font-semibold tabular-nums">
        {money(value)}
      </dd>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

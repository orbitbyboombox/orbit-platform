"use client";
import { formatDisplayDate, formatDisplayMonth } from "@/lib/display-date";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import { OrbitDocumentViewer } from "@/components/documents/orbit-document-viewer";
import { requestIndividualStaffBoletaAction } from "./actions";
import {
  closeStaffPaymentPeriodAction,
  configureStaffPaymentPeriodsAction,
  getStaffPaymentPeriodsAction,
  previewStaffPaymentPeriodAction,
  registerStaffPeriodPaymentAction,
} from "./payment-periods.actions";
import {
  periodLabel,
  type PaymentModality,
  type StaffPeriodPreview,
  type StaffPaymentPeriod,
} from "./payment-periods.model";

const money = (amount: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
type State = Extract<
  Awaited<ReturnType<typeof getStaffPaymentPeriodsAction>>,
  { ok: true }
>;
type Member = { id: string; name: string; rut: string };

export function StaffPaymentPeriodsPanel({
  month,
  staff,
}: {
  month: string;
  staff: Member[];
}) {
  const [data, setData] = useState<State | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [modality, setModality] = useState<PaymentModality>("MENSUAL");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [viewer, setViewer] = useState<StaffPaymentPeriod | null>(null);
  const [payment, setPayment] = useState<{
    preview: StaffPeriodPreview;
    name: string;
    key: string;
  } | null>(null);
  const [closing, setClosing] = useState<StaffPaymentPeriod | null>(null);
  const router = useRouter();
  const load = useCallback(async () => {
    const result = await getStaffPaymentPeriodsAction(month);
    if (result.ok) setData(result);
    else setMessage(result.message);
  }, [month]);
  useEffect(() => {
    let active = true;
    setData(null);
    setSelected([]);
    setMessage("");
    void getStaffPaymentPeriodsAction(month).then((result) => {
      if (!active) return;
      if (result.ok) setData(result);
      else setMessage(result.message);
    });
    return () => {
      active = false;
    };
  }, [month]);
  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok) {
        await load();
        router.refresh();
      }
    });
  }
  const eligible = staff.filter((member) => {
    const account = data?.accounts.find((row) => row.staff_id === member.id);
    return (
      !account ||
      (account.settlement_status !== "FINALIZED" &&
        account.payment_status !== "PAID" &&
        !data?.periods.some(
          (period) =>
            period.account_id === account.id && period.status === "FINALIZED",
        ))
    );
  });
  const allSelected =
    eligible.length > 0 &&
    eligible.every((member) => selected.includes(member.id));
  const accountForViewer = data?.accounts.find(
    (account) => account.id === viewer?.account_id,
  );
  return (
    <section
      className="min-w-0 space-y-4 rounded-2xl border border-brand/30 bg-brand/5 p-4 sm:p-5"
      aria-label="Pagos quincenales y mensuales Staff"
    >
      <div>
        <h3 className="text-lg font-semibold">Pagos quincenales y mensuales</h3>
        <p className="mt-1 text-sm text-muted">
          Selecciona uno, varios o todos los trabajadores para{" "}
          {formatDisplayMonth(month)}. Cada persona conserva su modalidad del
          mes.
        </p>
      </div>
      {data && (
        <div
          className="space-y-3 rounded-xl border border-white/10 p-3"
          aria-label="Resumen primera quincena"
        >
          <h4 className="font-semibold">
            Primera quincena · {formatDisplayDate(`${month}-01`)} al{" "}
            {formatDisplayDate(`${month}-14`)}
          </h4>
          <p className="text-sm text-muted">
            Montos de servicios realizados. Honorarios incluyen capacitación.
            Reembolsos separados de la boleta. El cierre estará disponible el
            día 14; el primer pago no exige boleta mensual y mantiene la
            validación tributaria.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Trabajador</th>
                  <th className="p-2">Honorarios</th>
                  <th className="p-2">Reembolsos pendientes</th>
                  <th className="p-2">Honorarios pagados</th>
                  <th className="p-2">Total pendiente</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.map((row) => (
                  <tr key={row.staff_id} className="border-t border-white/10">
                    <td className="p-2">
                      {row.staff_name}
                      {row.review_required && (
                        <span className="block text-xs text-amber-300">
                          {row.review_reason || "Revisión requerida"}
                        </span>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {money(Number(row.work_net))}
                      {Number(row.training_net) > 0 && (
                        <span className="block text-xs text-muted">
                          Capacitación {money(Number(row.training_net))}{" "}
                          incluida
                        </span>
                      )}
                    </td>
                    <td className="p-2">{money(Number(row.reimbursements))}</td>
                    <td className="p-2">{money(Number(row.paid))}</td>
                    <td className="p-2">
                      {money(Number(row.pending) + Number(row.reimbursements))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm font-semibold">
            Honorarios{" "}
            {money(
              data.summary.reduce((sum, row) => sum + Number(row.work_net), 0),
            )}{" "}
            · Reembolsos{" "}
            {money(
              data.summary.reduce(
                (sum, row) => sum + Number(row.reimbursements),
                0,
              ),
            )}{" "}
            · Total pendiente{" "}
            {money(
              data.summary.reduce(
                (sum, row) =>
                  sum + Number(row.pending) + Number(row.reimbursements),
                0,
              ),
            )}
          </p>
        </div>
      )}
      <form
        className="space-y-3"
        action={(form) => run(() => configureStaffPaymentPeriodsAction(form))}
      >
        <input type="hidden" name="month" value={month} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={pending || !data}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? eligible.map((member) => member.id)
                    : [],
                )
              }
            />
            Seleccionar todos disponibles
          </label>
          <label className="text-sm">
            Modalidad
            <select
              name="modality"
              className="ml-2 min-h-11 rounded-xl border bg-background px-3"
              value={modality}
              onChange={(event) =>
                setModality(event.target.value as PaymentModality)
              }
            >
              <option value="MENSUAL">MENSUAL</option>
              <option value="QUINCENAL">QUINCENAL</option>
            </select>
          </label>
        </div>
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((member) => {
            const account = data?.accounts.find(
              (row) => row.staff_id === member.id,
            );
            const schedule = data?.schedules.find(
              (row) => row.account_id === account?.id,
            );
            const disabled = !eligible.some((row) => row.id === member.id);
            return (
              <label
                key={member.id}
                className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border bg-background p-3 text-sm"
              >
                <input
                  name="staffIds"
                  type="checkbox"
                  value={member.id}
                  checked={selected.includes(member.id)}
                  disabled={pending || !data || disabled}
                  onChange={(event) =>
                    setSelected((ids) =>
                      event.target.checked
                        ? [...ids, member.id]
                        : ids.filter((id) => id !== member.id),
                    )
                  }
                />
                <span className="min-w-0 break-words">
                  {member.name}
                  <small className="block text-muted">
                    {schedule?.modality ?? "Mensual existente"}
                    {disabled ? " · período protegido" : ""}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
        {modality === "QUINCENAL" ? (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p>
              01–14 y 15–último día. El SII vincula la boleta y retención con la
              percepción de los honorarios. La consolidación en una boleta
              mensual requiere validación tributaria para estos pagos.
            </p>
            <a
              className="inline-flex min-h-11 items-center font-semibold text-brand"
              href="https://www.sii.cl/preguntas_frecuentes/boleta_honorario_electr/001_120_8261.htm"
              target="_blank"
              rel="noreferrer"
            >
              Ver criterio SII
            </a>
            <label className="flex items-center gap-2">
              <input name="taxValidated" type="checkbox" required />
              Validación tributaria obtenida para boleta mensual
            </label>
            <label className="block">
              Responsable y respaldo de la validación
              <textarea
                name="taxValidation"
                required
                minLength={10}
                className="mt-1 min-h-20 w-full rounded-xl border bg-background p-3"
                placeholder="Responsable contable, fecha y fundamento aplicable"
              />
            </label>
          </div>
        ) : null}
        <Button disabled={pending || !data || !selected.length}>
          Aplicar modalidad · {selected.length} seleccionados
        </Button>
      </form>
      {!data ? <p className="text-sm text-muted">Cargando períodos…</p> : null}
      <div className="space-y-3">
        {data?.schedules.map((schedule) => {
          const account = data.accounts.find(
            (row) => row.id === schedule.account_id,
          );
          const member = staff.find((row) => row.id === account?.staff_id);
          const periods = data.periods.filter(
            (row) => row.account_id === schedule.account_id,
          );
          const readyForBoleta =
            periods.length > 0 &&
            periods.every((row) => row.status === "FINALIZED");
          return (
            <article
              key={schedule.account_id}
              className="min-w-0 space-y-3 rounded-xl border bg-background p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{member?.name ?? "Trabajador"}</strong>
                <span className="text-xs font-semibold text-brand">
                  {schedule.modality} · {formatDisplayMonth(month)}
                </span>
              </div>
              {periods.map((period) => {
                const calc = period.snapshot;
                const payments = data.payments.filter(
                  (row) => row.period_id === period.id,
                );
                const paid = payments.reduce(
                  (total, row) => total + Number(row.amount),
                  0,
                );
                const remaining = Math.max(
                  0,
                  Number(calc?.workPending ?? 0) - paid,
                );
                return (
                  <div
                    key={period.id}
                    className="space-y-2 rounded-xl border p-3 text-sm"
                  >
                    <p className="font-semibold">
                      {periodLabel(period.period_code)}
                    </p>
                    <p className="text-muted">
                      {formatDisplayDate(period.starts_on)} a{" "}
                      {formatDisplayDate(period.ends_on)} ·{" "}
                      {period.status === "FINALIZED" ? "CERRADO" : "ABIERTO"}
                    </p>
                    {calc ? (
                      <p>
                        Honorarios {money(Number(calc.workNet))} · Adelantos{" "}
                        {money(Number(calc.advancesTotal))} · Pagado en el
                        bloque {money(paid)} · Saldo {money(remaining)}
                      </p>
                    ) : null}
                    {calc ? (
                      <p className="text-xs text-muted">
                        Reembolsos {money(Number(calc.reimbursementsTotal))},
                        gestionados en su registro de gastos.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() => setViewer(period)}
                      >
                        PREVISUALIZAR LIQUIDACIÓN
                      </Button>
                      {period.status === "DRAFT" ? (
                        <Button
                          disabled={pending}
                          onClick={() => setClosing(period)}
                        >
                          {period.period_code === "Q1"
                            ? "CERRAR PRIMERA QUINCENA"
                            : period.period_code === "Q2"
                              ? "CERRAR SEGUNDA QUINCENA"
                              : "CERRAR MES"}
                        </Button>
                      ) : (
                        <>
                          <a
                            className="inline-flex min-h-11 items-center rounded-xl border px-3 text-xs font-semibold"
                            href={`/api/staff-monthly-accounts/${period.account_id}/settlement-pdf?period=${period.id}&download=1`}
                          >
                            DESCARGAR PDF
                          </a>
                          {remaining > 0 ? (
                            <Button
                              disabled={pending}
                              onClick={() =>
                                start(async () => {
                                  const result =
                                    await previewStaffPaymentPeriodAction(
                                      period.id,
                                    );
                                  if (result.ok)
                                    setPayment({
                                      preview: result.preview,
                                      name: member?.name ?? "Trabajador",
                                      key: crypto.randomUUID(),
                                    });
                                  else setMessage(result.message);
                                })
                              }
                            >
                              REGISTRAR PAGO
                            </Button>
                          ) : (
                            <span className="self-center font-semibold text-emerald-600">
                              Sin saldo pendiente
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {payments.length ? (
                      <details>
                        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                          Historial de pagos ({payments.length})
                        </summary>
                        <ul className="space-y-2">
                          {payments.map((row) => (
                            <li key={row.id} className="break-words">
                              {formatDisplayDate(row.paid_on)} ·{" "}
                              {money(Number(row.amount))} · {row.method} ·{" "}
                              {row.reference}
                              <a
                                className="ml-2 font-semibold text-brand"
                                href={`/api/staff-documents/${account?.staff_id}/${row.receipt_document_id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Comprobante
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                );
              })}
              {readyForBoleta && account ? (
                <form
                  action={(form) =>
                    run(() => requestIndividualStaffBoletaAction(form))
                  }
                >
                  <input
                    name="staffId"
                    type="hidden"
                    value={account.staff_id}
                  />
                  <input name="month" type="hidden" value={month} />
                  <Button
                    disabled={
                      pending ||
                      account.boleta_status === "APPROVED" ||
                      account.boleta_status === "RECEIVED"
                    }
                  >
                    SOLICITAR BOLETA MENSUAL
                  </Button>
                  <p className="mt-2 text-xs text-muted">
                    Una boleta por los honorarios del mes. Los reembolsos se
                    excluyen del monto tributario.
                  </p>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
      {data?.audit.length ? (
        <details className="rounded-xl border p-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            Historial de modalidades, cierres y pagos
          </summary>
          <ul className="mt-3 space-y-2">
            {data.audit.map((row) => (
              <li key={row.id}>
                {formatDisplayDate(row.occurred_at)}{" "}
                {new Date(row.occurred_at).toLocaleTimeString("es-CL", {
                  timeZone: "America/Santiago",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                ·{" "}
                {
                  staff.find(
                    (member) =>
                      member.id ===
                      data.accounts.find(
                        (account) => account.id === row.account_id,
                      )?.staff_id,
                  )?.name
                }{" "}
                ·{" "}
                {
                  (
                    {
                      MODALITY_APPLIED: "Modalidad aplicada",
                      PERIOD_CLOSED: "Bloque cerrado",
                      PAYMENT_RECORDED: "Pago registrado",
                    } as Record<string, string>
                  )[row.action]
                }
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {message ? (
        <p className="break-words text-sm" role="status">
          {message}
        </p>
      ) : null}
      {viewer && accountForViewer ? (
        <OrbitDocumentViewer
          onClose={() => setViewer(null)}
          src={`/api/staff-monthly-accounts/${accountForViewer.id}/settlement-pdf?period=${viewer.id}`}
          title={periodLabel(viewer.period_code)}
        />
      ) : null}
      {closing ? (
        <MobileDialog
          title="Cerrar bloque Staff"
          description={periodLabel(closing.period_code)}
          onClose={() => !pending && setClosing(null)}
        >
          <p className="text-sm">
            El cierre congela los servicios y conceptos del bloque. Revisa la
            liquidación antes de confirmar.
          </p>
          <Button
            className="mt-4"
            disabled={pending}
            onClick={() => {
              const id = closing.id;
              setClosing(null);
              run(() => closeStaffPaymentPeriodAction(id));
            }}
          >
            Confirmar cierre
          </Button>
        </MobileDialog>
      ) : null}
      {payment ? (
        <MobileDialog
          title="Registrar pago Staff"
          description={`${payment.name} · ${periodLabel(payment.preview.period_code)}`}
          onClose={() => !pending && setPayment(null)}
        >
          <form
            className="space-y-3"
            action={(form) =>
              start(async () => {
                const result = await registerStaffPeriodPaymentAction(form);
                setMessage(result.message);
                if (result.ok) {
                  setPayment(null);
                  await load();
                  router.refresh();
                }
              })
            }
          >
            <p>
              Saldo del bloque {money(payment.preview.remaining)}. Puedes
              registrar un pago parcial.
            </p>
            {payment.preview.period_code === "Q1" ? (
              <p className="rounded-xl border border-amber-500/40 p-3 text-sm">
                Se usará la validación tributaria documentada al aplicar la
                modalidad. El pago y la retención deben quedar en el período
                tributario correspondiente.
              </p>
            ) : (
              <p className="text-sm">La boleta mensual debe estar aprobada.</p>
            )}
            <input type="hidden" name="periodId" value={payment.preview.id} />
            <input type="hidden" name="idempotencyKey" value={payment.key} />
            <label className="block text-sm">
              Monto de honorarios
              <input
                name="amount"
                type="number"
                min="1"
                step="1"
                max={payment.preview.remaining}
                defaultValue={payment.preview.remaining}
                required
                className="mt-1 min-h-11 w-full rounded-xl border px-3"
              />
            </label>
            <label className="block text-sm">
              Fecha del pago
              <input
                name="paidOn"
                type="date"
                required
                className="mt-1 min-h-11 w-full rounded-xl border px-3"
              />
            </label>
            <label className="block text-sm">
              Método
              <input
                name="method"
                required
                className="mt-1 min-h-11 w-full rounded-xl border px-3"
                placeholder="Transferencia, efectivo u otro"
              />
            </label>
            <label className="block text-sm">
              Referencia
              <input
                name="reference"
                className="mt-1 min-h-11 w-full rounded-xl border px-3"
              />
            </label>
            <label className="block text-sm">
              Comprobante
              <input
                name="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                required
                className="mt-2 block w-full"
              />
            </label>
            <Button disabled={pending}>REGISTRAR PAGO</Button>
          </form>
        </MobileDialog>
      ) : null}
    </section>
  );
}

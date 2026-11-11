"use client";
import {formatDisplayDate} from "@/lib/display-date";

import { useEffect, useState } from "react";
import { getOwnStaffPaymentPeriodsAction } from "./payment-periods.actions";
import { periodLabel } from "./payment-periods.model";

export function OwnPaymentPeriods({ accountId }: { accountId: string }) {
  const [data, setData] = useState<Extract<
    Awaited<ReturnType<typeof getOwnStaffPaymentPeriodsAction>>,
    { ok: true }
  > | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    void getOwnStaffPaymentPeriodsAction(accountId).then((result) => {
      if (active && result.ok) setData(result);
    });
    return () => {
      active = false;
    };
  }, [accountId]);
  if (!data?.modality) return null;
  const money = (amount: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(amount);
  return (
    <section className="mt-4 space-y-3 rounded-xl border p-3 text-sm">
      <h4 className="font-semibold">Modalidad de pago {data.modality}</h4>
      {data.periods.map((period) => {
        const payments = data.payments.filter(
          (payment) => payment.period_id === period.id,
        );
        const paid = payments.reduce(
          (sum, payment) => sum + Number(payment.amount),
          0,
        );
        return (
          <div className="space-y-2 rounded-xl border p-3" key={period.id}>
            <p className="font-semibold">{periodLabel(period.period_code)}</p>
            <p>
              Pagado {money(paid)} · Saldo{" "}
              {money(
                Math.max(0, Number(period.snapshot?.workPending ?? 0) - paid),
              )}
            </p>
            {payments.map((payment) => (
              <p key={payment.id}>
                {formatDisplayDate(payment.paid_on)} · {money(Number(payment.amount))} ·{" "}
                {payment.method}
              </p>
            ))}
            <a
              className="inline-flex min-h-11 items-center font-semibold text-brand"
              href={`/api/staff-monthly-accounts/${accountId}/settlement-pdf?period=${period.id}&download=1`}
            >
              Descargar liquidación del bloque
            </a>
          </div>
        );
      })}
    </section>
  );
}

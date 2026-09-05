"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, Search, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { closeStaffMonthAction, previewStaffMonthCloseAction, reopenStaffMonthAction } from "./actions";
import {StaffMonthlyAccountPanel}from"@/features/staff-monthly-account/staff-monthly-account-panel";
import {generateMonthlyStaffAccountsAction}from"@/features/staff-monthly-account/actions";
import type{StaffMonthlyAccount}from"@/features/staff-monthly-account/model";

export type StaffPaymentEvent = {
  id: string;
  staffId: string;
  projectId: string;
  eventName: string;
  eventDate: string;
  accountingMonth: string;
  customer: string;
  service: string;
  durationHours: number;
  roles: string[];
  amount: number;
  originalNet: number;
  adjustmentTotal: number;
  reimbursementTotal: number;
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
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const roleLabel = (value: string) =>
  ({ OPERATOR: "Operador", ASSEMBLY: "Montaje", DISASSEMBLY: "Desmontaje" })[
    value
  ] ?? value;

export function StaffPaymentsCenter({
  staff,
  events,
  months,
}: {
  staff: StaffPaymentMember[];
  events: StaffPaymentEvent[];
  months: StaffPaymentMonth[];
}) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [openStaffId,setOpenStaffId]=useState<string|null>(null);
  const [query, setQuery] = useState("");
  const [closeState,setCloseState]=useState<{status?:string;dueDate?:string;eligible?:number;ineligible?:number;totals?:{people?:number;total?:number;paid?:number;pending?:number;receiptsPending?:number}}|null>(null),[closeMessage,setCloseMessage]=useState(""),[reopenReason,setReopenReason]=useState(""),[closing,startClosing]=useTransition();
  useEffect(()=>{let active=true;startClosing(async()=>{const result=await previewStaffMonthCloseAction(month);if(active){if(result.ok)setCloseState(result.data);else setCloseMessage(result.error??"No fue posible cargar el cierre mensual.")}});return()=>{active=false}},[month]);
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
              item.staffId === member.id &&
              item.eventDate.startsWith(month),
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
            payrollNet = original + adjustments,
            finalAmount = payrollNet + reimbursements,
            paid = eventRows.reduce((sum, item) => sum + item.paidAmount, 0);
          return {
            member,
            eventRows,
            original,
            adjustments,
            reimbursements,
            finalAmount,
            paid,
            outstanding: eventRows.reduce(
              (sum, item) =>
                sum + Math.max(0, item.finalAmount - item.paidAmount),
              0,
            ),
            account: months.find(item=>item.staffId===member.id&&item.month.startsWith(month))?.account,
          };
        })
        .filter((row)=>row.eventRows.length>0||Boolean(row.account)),
    [events, month, months, query, staff],
  );
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
            Trabajo, boleta SII, adelantos y saldo final desde una sola fuente canónica.
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
      <section className="rounded-2xl border border-brand/25 bg-brand/5 p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Cierre mensual Staff</p><h3 className="mt-1 text-lg font-semibold">{month} · {closeState?.status??"OPEN"}</h3><p className="mt-1 text-sm text-muted">El período se determina por la fecha canónica del Evento.</p></div><div className="flex flex-wrap gap-2"><form action={form=>startClosing(async()=>{const result=await generateMonthlyStaffAccountsAction(form);setCloseMessage(result.message);if(result.ok)location.reload()})}><input name="month" type="hidden" value={month}/><Button disabled={closing}>Generar / actualizar liquidaciones</Button></form><Button disabled={closing||closeState?.status==='CLOSED'||closeState?.status==='PAID'} onClick={()=>startClosing(async()=>{const r=await closeStaffMonthAction(month);if(r.ok){setCloseState(r.data);setCloseMessage("Mes cerrado y universo congelado.")}else setCloseMessage(r.error??"No fue posible cerrar el mes.")})} variant="outline">Cerrar mes</Button><input className="min-h-11 rounded-xl border bg-background px-3" onChange={e=>setReopenReason(e.target.value)} placeholder="Motivo para reabrir" value={reopenReason}/><Button disabled={closing||closeState?.status!=='CLOSED'||reopenReason.trim().length<3} onClick={()=>startClosing(async()=>{const r=await reopenStaffMonthAction(month,reopenReason);if(r.ok){setCloseState(r.data);setCloseMessage("Mes reabierto con auditoría.")}else setCloseMessage(r.error??"No fue posible reabrir el mes.")})} variant="outline">Reabrir</Button></div></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"><Metric label="Personas" value={Number(closeState?.totals?.people??0)}/><Metric label="Total" value={Number(closeState?.totals?.total??0)}/><Metric label="Pagado" value={Number(closeState?.totals?.paid??0)}/><Metric label="Pendiente" value={Number(closeState?.totals?.pending??0)}/><Metric label="Boletas pendientes" value={Number(closeState?.totals?.receiptsPending??0)}/><Metric label="Elegibles" value={Number(closeState?.eligible??0)}/><Metric label="En revisión" value={Number(closeState?.ineligible??0)}/></div>{closeMessage&&<p aria-live="polite" className="mt-3 text-sm text-muted">{closeMessage}</p>}</section>
      <PaymentSheet month={month} rows={rows}/>
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((row) => (
          <details open={openStaffId===row.member.id}
            className="rounded-2xl border p-4 sm:p-5"
            onToggle={(event)=>{if(event.currentTarget.open)setOpenStaffId(row.member.id);else if(openStaffId===row.member.id)setOpenStaffId(null)}}
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
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric label="Neto original" value={row.original} />
                <Metric label="Ajustes" value={row.adjustments} />
                <Metric label="Reembolsos" value={row.reimbursements} />
                <Metric label="Monto final" value={row.finalAmount} />
                <Metric label="Ya pagado" value={row.paid} />
                <Metric label="Saldo pendiente" value={row.outstanding} />
                <Metric label="Boleta SII" value={row.account?.boletaGross??0} />
                <Metric
                  label="Boletas pendientes"
                  value={
                    row.eventRows.filter((x) => x.receiptStatus !== "RECEIVED")
                      .length
                  }
                />
                <Metric
                  label="Boletas recibidas"
                  value={
                    row.eventRows.filter((x) => x.receiptStatus === "RECEIVED")
                      .length
                  }
                />
                <Metric
                  label="Eventos trabajados"
                  value={row.eventRows.length}
                />
              </dl>
              <p className="mt-3 text-xs font-semibold text-brand">
                  Ver liquidación
              </p>
            </summary>
            <div className="mt-4 space-y-3">
              {row.account&&<StaffMonthlyAccountPanel account={row.account} mode="FOUNDER" onBack={()=>setOpenStaffId(null)}/>}
              {row.eventRows.map((item) => (
                <EventRow item={item} key={item.id} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
function PaymentSheet({month,rows}:{month:string;rows:Array<{member:StaffPaymentMember;account?:StaffMonthlyAccount}>}){const payable=rows.filter(row=>row.account).map(row=>({member:row.member,account:row.account!})),total=payable.reduce((sum,row)=>sum+(row.account.boletaStatus==="APPROVED"&&row.account.paymentStatus==="READY_TO_PAY"?row.account.finalTransferAmount:0),0);return <section className="rounded-2xl border bg-background/40 p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Planilla de pagos Staff</p><h3 className="mt-1 text-xl font-semibold capitalize">{new Date(`${month}-01T12:00:00Z`).toLocaleDateString("es-CL",{month:"long",year:"numeric"})}</h3></div><button className="min-h-11 rounded-xl border px-4 text-sm font-semibold print:hidden" onClick={()=>window.print()} type="button">Imprimir planilla</button></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wider text-muted"><th className="p-3">Operador</th><th className="p-3">Período</th><th className="p-3 text-right">Total a depositar</th><th className="p-3">Estado</th></tr></thead><tbody>{payable.map(({member,account})=><tr className="border-b" key={account.id}><td className="p-3 font-semibold">{member.name}</td><td className="p-3">{month}</td><td className="p-3 text-right font-semibold">{account.boletaStatus==="APPROVED"&&account.paymentStatus==="READY_TO_PAY"?money.format(account.finalTransferAmount):"—"}</td><td className="p-3">{account.paymentStatus==="READY_TO_PAY"?"LISTO PARA PAGAR":account.paymentStatus==="PAID"?"PAGADO":account.boletaStatus==="RECEIVED"?"BOLETA EN REVISIÓN":account.boletaStatus==="REJECTED"?"BOLETA RECHAZADA":"BOLETA PENDIENTE"}</td></tr>)}</tbody></table></div><div className="mt-4 flex flex-col gap-1 rounded-xl bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><strong>TOTAL GENERAL A DEPOSITAR</strong><strong className="text-2xl text-brand">{money.format(total)}</strong></div></section>}
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
            {item.service} · {item.durationHours} horas ·{" "}
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
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <Box label="Original" value={money.format(item.originalNet)} />
        <Box label="Ajustes" value={money.format(item.adjustmentTotal)} />
        <Box label="Reembolsos" value={money.format(item.reimbursementTotal)} />
        <Box label="Monto final" value={money.format(item.finalAmount)} />
        <Box label="Anticipo / pagado" value={money.format(item.paidAmount)} />
        <Box
          label="Saldo"
          value={money.format(Math.max(0, item.finalAmount - item.paidAmount))}
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

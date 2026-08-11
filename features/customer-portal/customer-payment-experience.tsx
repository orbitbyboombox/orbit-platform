"use client";

import { Download, FileCheck2, Upload } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";

type PortalData = NonNullable<Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>>>;
type Project = PortalData["project"] & { finance: Record<string, unknown> };

const money = (value: number | string | null | undefined) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value ?? 0));
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`)) : "Por confirmar";

export function CustomerPaymentExperience({ data, token }: { data: PortalData; token: string }) {
  const project = data.project as Project;
  const invoice = data.invoice;
  const contractTotal = Number(invoice?.amount ?? data.quotation?.final_customer_price ?? data.quotation?.grand_total ?? 0);
  const effectiveStatus = invoice?.status ?? String(project.finance.paymentStatus ?? project.finance.status ?? "PENDING");
  const reservation = Number(project.finance.reservationAmount ?? Math.round(contractTotal * .5));
  const recordedPaid = Number(invoice?.paid_amount ?? project.finance.totalPaid ?? 0);
  const totalPaid = effectiveStatus === "PAID" && recordedPaid === 0 ? contractTotal : ["PARTIALLY_PAID", "RESERVATION_RECEIVED", "APPROVED"].includes(effectiveStatus) && recordedPaid === 0 ? reservation : recordedPaid;
  const remaining = Math.max(0, Number(invoice ? contractTotal - totalPaid : project.finance.remainingBalance ?? contractTotal - totalPaid));
  const paid = remaining === 0 && contractTotal > 0 || effectiveStatus === "PAID";
  const partial = !paid && totalPaid > 0;
  const paymentStatus = paid ? { label: "🟢 Pagado", variant: "success" as const } : partial ? { label: "🟡 Pago parcial", variant: "warning" as const } : { label: "🔴 Pendiente", variant: "danger" as const };
  const receipts = data.documents.filter((item) => item.document_type === "PAYMENT_RECEIPT");

  return <section className="scroll-mt-6 overflow-hidden rounded-3xl border border-border/80 bg-card" id="payments">
    <header className="border-b border-border/70 p-5 sm:p-7"><a className="text-sm font-semibold text-brand hover:underline" href="#quick-access">← Volver al Inicio</a><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Estado financiero</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Mis pagos</h2></div><StatusBadge label={paymentStatus.label} variant={paymentStatus.variant}/></div></header>
    <div className="space-y-6 p-5 sm:p-7">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Total del contrato" value={money(contractTotal)}/><Metric label="Reserva pagada" value={money(Math.min(totalPaid, reservation))}/><Metric label="Saldo restante" value={money(remaining)}/><Metric label="Estado del pago" value={paymentStatus.label}/></div>

      <section className="rounded-2xl border border-border/80 bg-background/30 p-4 sm:p-5"><div className="flex items-center gap-2"><FileCheck2 className="size-5 text-brand"/><h3 className="font-semibold">Comprobantes</h3></div>{receipts.length ? <div className="mt-4 space-y-3">{receipts.map((receipt, index) => { const url = `/api/portal/${encodeURIComponent(token)}/payment-receipt/${receipt.id}?download=1`; return <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3" key={receipt.id}><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Comprobante {index + 1}</p><p className="text-xs text-muted">Subido el {date(receipt.created_at)}</p></div><ActionButton icon={Download} label="Descargar" onClick={() => window.open(url, "_blank", "noopener,noreferrer")} variant="outline"/></div>})}</div> : <p className="mt-4 text-sm text-muted">Todavía no se han cargado comprobantes.</p>}</section>

      {!paid && <section className="rounded-2xl border border-brand/20 bg-brand/5 p-4 sm:p-5"><div className="flex items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-muted">Monto pendiente</p><p className="mt-1 text-2xl font-semibold text-brand">{money(remaining)}</p></div><Upload className="size-6 text-brand"/></div><form action={`/api/portal/${encodeURIComponent(token)}/payment-receipt`} className="mt-4 space-y-3" encType="multipart/form-data" method="post"><label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border p-4 text-center"><Upload className="size-5 text-brand"/><span className="mt-2 text-sm font-semibold">Subir comprobante</span><span className="mt-1 text-xs text-muted">JPG, PNG o PDF · máximo 20 MB</span><input accept="image/jpeg,image/png,application/pdf" className="sr-only" name="receipt" required type="file"/></label><ActionButton className="w-full" icon={Upload} label="Enviar comprobante" type="submit"/></form></section>}
    </div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-border/70 bg-background/35 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>; }

"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, Download, Eye, FileCheck2, ReceiptText, Upload } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";

type PortalData = NonNullable<Awaited<ReturnType<typeof import("./customer-portal.service").loadCustomerPortal>>>;
type Project = PortalData["project"] & { finance: Record<string, unknown>; project_services: Array<{ service_code: string; duration_hours: number | null; extras: unknown }> };

const money = (value: number | string | null | undefined) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value ?? 0));
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`)) : "Por confirmar";
const method: Record<string, string> = { TRANSFER: "Transferencia", BANK_TRANSFER: "Transferencia", MERCADO_PAGO: "Mercado Pago", CASH: "Efectivo", CREDIT_CARD: "Tarjeta de crédito", DEBIT_CARD: "Tarjeta de débito" };

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
  const partial = !paid && (totalPaid > 0 || ["PARTIALLY_PAID", "RESERVATION_RECEIVED", "APPROVED"].includes(effectiveStatus));
  const paymentStatus = paid ? { label: "🟢 Pagado", variant: "success" as const } : partial ? { label: "🟡 Pago parcial", variant: "warning" as const } : { label: "🔴 Pendiente", variant: "danger" as const };
  const receipts = data.documents.filter((item) => item.document_type === "PAYMENT_RECEIPT");
  const [preview, setPreview] = useState<string | null>(null);
  const service = project.project_services.map((item) => item.service_code).join(" + ") || "Por confirmar";
  const hours = project.project_services.map((item) => item.duration_hours ? `${item.duration_hours} horas` : null).filter(Boolean).join(" · ") || "Por confirmar";
  const extras = project.project_services.flatMap((item) => normalizeExtras(item.extras));
  const payments = [...(invoice?.invoice_payments ?? [])].sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  const dueDate = invoice?.due_date ?? String(project.finance.dueDate ?? data.quotation?.expiration_date ?? "");

  return <section className="scroll-mt-6 overflow-hidden rounded-3xl border border-border/80 bg-card" id="payments">
    <header className="border-b border-border/70 p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-brand">Estado financiero</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Mis pagos</h2><p className="mt-2 text-sm leading-6 text-muted">Tu contrato, pagos y comprobantes en un solo lugar.</p></div><StatusBadge label={paymentStatus.label} variant={paymentStatus.variant}/></div></header>
    <div className="space-y-6 p-5 sm:p-7">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Valor del contrato" value={money(contractTotal)}/><Metric label="Reserva pagada" value={money(Math.min(totalPaid, reservation))}/><Metric label="Saldo restante" value={money(remaining)}/><Metric label="Total pagado" value={money(totalPaid)}/><Metric label="Estado" value={paymentStatus.label}/></div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,.75fr)]">
        <div className="space-y-6">
          <Card title="Historial de pagos" icon={ReceiptText}>{payments.length ? <ol className="space-y-3">{payments.map((payment, index) => <li className="grid gap-2 rounded-xl border border-border/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center" key={payment.id}><div><p className="font-semibold">{index === 0 ? "Pago de reserva" : index === payments.length - 1 && paid ? "Pago de saldo" : "Pago adicional"}</p><p className="mt-1 text-xs text-muted">{date(payment.paid_at)} · {method[payment.method] ?? payment.method}</p></div><p className="font-semibold text-success">{money(payment.amount)}</p></li>)}</ol> : <Empty text="Aún no existen pagos validados."/>}{!paid && <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-border p-4 text-sm"><span className="text-muted">Saldo pendiente</span><strong>{money(remaining)}</strong></div>}</Card>

          <Card title="Comprobantes de pago" icon={FileCheck2}>{receipts.length ? <div className="space-y-3">{receipts.map((receipt, index) => { const url = `/api/portal/${encodeURIComponent(token)}/payment-receipt/${receipt.id}`; return <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3" key={receipt.id}><FileCheck2 className="size-5 text-brand"/><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Comprobante {index + 1}</p><p className="text-xs text-muted">Subido el {date(receipt.created_at)}</p></div><ActionButton icon={Eye} label="Vista previa" onClick={() => setPreview(url)} variant="outline"/><ActionButton icon={Download} label="Descargar" onClick={() => window.open(`${url}?download=1`, "_blank", "noopener,noreferrer")} variant="outline"/></div>})}</div> : <Empty text="Todavía no se han cargado comprobantes."/>}{preview && <div className="mt-4 overflow-hidden rounded-xl border border-border"><div className="flex items-center justify-between border-b px-3 py-2"><p className="text-xs font-semibold">Vista previa protegida</p><button className="text-xs text-brand" onClick={() => setPreview(null)} type="button">Cerrar</button></div><iframe className="h-96 w-full bg-white" src={preview} title="Vista previa del comprobante de pago"/></div>}</Card>
        </div>

        <aside className="space-y-6">
          <Card title="Resumen comercial" icon={CreditCard}><dl className="space-y-3"><Row label="Servicio" value={service}/><Row label="Horas" value={hours}/><Row label="Extras" value={extras.join(" · ") || "Sin extras"}/><Row label="Transporte" value={money(data.quotation?.transport_total)}/><Row label="Descuento" value={data.quotation?.discount_total ? `−${money(data.quotation.discount_total)}` : money(0)}/><Row emphasis label="Total contrato" value={money(contractTotal)}/><Row label="Reserva" value={money(reservation)}/><Row label="Saldo restante" value={money(remaining)}/></dl></Card>
          {!paid && <Card title="Tu próxima acción" icon={Upload}><div className="rounded-xl border border-brand/20 bg-brand/5 p-4"><p className="text-xs uppercase tracking-wide text-muted">Monto pendiente</p><p className="mt-1 text-2xl font-semibold text-brand">{money(remaining)}</p><p className="mt-3 text-sm">Vencimiento: <strong>{date(dueDate)}</strong></p><p className="mt-3 text-sm leading-6 text-muted">Realiza el pago según las instrucciones acordadas y adjunta aquí tu comprobante. BOOMBOX lo validará antes de actualizar el estado.</p></div><form action={`/api/portal/${encodeURIComponent(token)}/payment-receipt`} className="mt-4 space-y-3" encType="multipart/form-data" method="post"><label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border p-4 text-center"><Upload className="size-5 text-brand"/><span className="mt-2 text-sm font-semibold">Subir comprobante de pago</span><span className="mt-1 text-xs text-muted">JPG, PNG o PDF · máximo 20 MB</span><input accept="image/jpeg,image/png,application/pdf" className="sr-only" name="receipt" required type="file"/></label><ActionButton className="w-full" icon={Upload} label="Enviar comprobante" type="submit"/></form></Card>}
        </aside>
      </div>
    </div>
  </section>;
}

function normalizeExtras(value: unknown): string[] { if (!Array.isArray(value)) return []; return value.map((item) => typeof item === "string" ? item : item && typeof item === "object" ? String((item as Record<string, unknown>).label ?? (item as Record<string, unknown>).name ?? "") : "").filter(Boolean); }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-border/70 bg-background/35 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>; }
function Card({ title, icon: Icon, children }: { title: string; icon: typeof CreditCard; children: React.ReactNode }) { return <section className="rounded-2xl border border-border/80 bg-background/30 p-4 sm:p-5"><div className="flex items-center gap-2"><Icon className="size-5 text-brand"/><h3 className="font-semibold">{title}</h3></div><div className="mt-4">{children}</div></section>; }
function Row({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div className={`flex items-start justify-between gap-4 text-sm ${emphasis ? "border-t border-border/70 pt-3" : ""}`}><dt className="text-muted">{label}</dt><dd className={`max-w-[60%] text-right ${emphasis ? "text-base font-semibold text-brand" : "font-medium"}`}>{value}</dd></div>; }
function Empty({ text }: { text: string }) { return <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-border p-5 text-center"><CheckCircle2 className="size-5 text-muted"/><p className="mt-2 text-sm text-muted">{text}</p></div>; }

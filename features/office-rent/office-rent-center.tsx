"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarClock, CheckCircle2, Download, FileText, Landmark, Pencil, Plus, ReceiptText, Upload, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { generateOfficeLeaseReceiptAction, registerOfficeLeasePaymentAction, saveOfficeLeaseSettingsAction, uploadOfficeLeaseDocumentAction } from "./actions";
import { formatClp, formatOfficeDate, monthLabel, receiptLabel, type OfficeLeaseDataset, type OfficeLeaseDocument, type OfficeLeaseMonth, type OfficeLeaseStatus } from "./model";

const statusMeta: Record<OfficeLeaseStatus, { label: string; className: string }> = {
  PAID: { label: "Pagado", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" },
  PENDING: { label: "Pendiente", className: "border-amber-500/25 bg-amber-500/10 text-amber-200" },
  OVERDUE: { label: "Atrasado", className: "border-red-500/25 bg-red-500/10 text-red-300" },
};

function Modal({ children, title, description, onClose }: { children: React.ReactNode; title: string; description: string; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation">
    <section aria-labelledby="office-rent-modal-title" aria-modal="true" className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border bg-card shadow-2xl sm:max-w-3xl sm:rounded-3xl" role="dialog">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-card/95 p-5 backdrop-blur sm:p-6">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Arriendo Oficina</p><h2 className="mt-1 text-2xl font-semibold" id="office-rent-modal-title">{title}</h2><p className="mt-1 text-sm text-muted">{description}</p></div>
        <Button aria-label="Cerrar" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5"/></Button>
      </header>
      {children}
    </section>
  </div>;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={cn("grid gap-1.5 text-sm", className)}><span className="font-medium">{label}</span>{children}</label>;
}

const inputClass = "min-h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

function MetricCard({ icon, label, value, detail, danger = false }: { icon: React.ReactNode; label: string; value: string; detail?: string; danger?: boolean }) {
  return <article className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><div className="flex items-center gap-2 text-muted">{icon}<span className="text-xs font-semibold uppercase tracking-[.12em]">{label}</span></div><p className={cn("mt-3 text-2xl font-semibold tracking-tight", danger && "text-red-300")}>{value}</p>{detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}</article>;
}

function DocumentLinks({ document }: { document: OfficeLeaseDocument }) {
  const openHref = document.documentType === "INCOME_RECEIPT"
    ? `/office-rent/documents/${document.id}`
    : `/api/office-rent/documents/${document.id}?disposition=inline`;
  return <span className="inline-flex gap-1">
    <Button asChild size="sm" variant="ghost"><a href={openHref}><FileText className="size-3.5"/>Abrir</a></Button>
    <Button asChild size="sm" variant="ghost"><a href={`/api/office-rent/documents/${document.id}?disposition=attachment`}><Download className="size-3.5"/><span className="sr-only">Descargar {document.originalFilename}</span></a></Button>
  </span>;
}

export function OfficeRentCenter({ data }: { data: OfficeLeaseDataset }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!hydrated) return <div aria-busy="true" aria-label="Cargando Arriendo Oficina"><PageSkeleton/></div>;
  return <OfficeRentHydrated data={data}/>;
}

function OfficeRentHydrated({ data }: { data: OfficeLeaseDataset }) {
  const router = useRouter();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paymentMonthId, setPaymentMonthId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRequestId, setPaymentRequestId] = useState("");
  const [documentRequestId, setDocumentRequestId] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [paymentPending, startPayment] = useTransition();
  const [settingsPending, startSettings] = useTransition();
  const [documentPending, startDocument] = useTransition();
  const [receiptPending, startReceipt] = useTransition();
  const outstandingMonths = data.months.filter((month) => month.outstandingAmount > 0);
  const currentMonth = data.months.find((month) => month.period === data.currentPeriod);
  const monthById = new Map(data.months.map((month) => [month.id, month]));
  const documentsByPayment = (paymentId: string, type: OfficeLeaseDocument["documentType"]) => data.documents.find((document) => document.paymentId === paymentId && document.documentType === type);

  const openPayment = (month?: OfficeLeaseMonth) => {
    const selected = month ?? currentMonth ?? outstandingMonths[0];
    setPaymentMonthId(selected?.id ?? "");
    setPaymentAmount(selected ? String(selected.outstandingAmount) : "");
    setPaymentRequestId(crypto.randomUUID());
    setNotice(null);
    setPaymentOpen(true);
  };

  const submit = (form: HTMLFormElement, action: (form: FormData) => Promise<{ ok: true; message: string } | { ok: false; error: string }>, start: React.TransitionStartFunction, close?: () => void) => {
    const formData = new FormData(form);
    start(async () => {
      const result = await action(formData);
      setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
      if (result.ok) {
        close?.();
        router.refresh();
      }
    });
  };

  return <main className="space-y-6 pb-12">
    <section className="overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_right,rgba(247,137,0,.15),transparent_42%),linear-gradient(145deg,rgba(20,22,27,.98),rgba(10,12,16,.98))] p-5 shadow-xl sm:p-8">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><StatusBadge label="Founder / Admin" variant="success"/><p className="mt-5 text-xs font-semibold uppercase tracking-[.22em] text-brand">Administración patrimonial</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Arriendo Oficina</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Control mensual de {data.settings.unitName}, comprobantes, recibos de ingreso y costo neto real de la oficina.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row"><Button disabled={!outstandingMonths.length} onClick={() => openPayment()}><Plus className="size-4"/>{outstandingMonths.length ? "REGISTRAR PAGO" : "MES CUBIERTO"}</Button><Button onClick={() => { setNotice(null); setSettingsOpen(true); }} variant="outline"><Pencil className="size-4"/>Administrar ficha</Button></div>
      </div>
    </section>

    {notice ? <div className={cn("rounded-2xl border p-4 text-sm", notice.ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-red-500/25 bg-red-500/10 text-red-200")} role={notice.ok ? "status" : "alert"}>{notice.text}</div> : null}

    <section className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <MetricCard detail={data.settings.commonExpensesIncluded ? "Gastos comunes incluidos" : "Gastos comunes no incluidos"} icon={<WalletCards className="size-4 text-brand"/>} label="Arriendo mensual" value={formatClp(data.settings.monthlyAmount)}/>
      <MetricCard danger={data.metrics.currentStatus === "OVERDUE"} detail={data.metrics.currentOutstanding > 0 ? `${formatClp(data.metrics.currentOutstanding)} pendiente` : "Mes completamente cubierto"} icon={<CheckCircle2 className="size-4 text-brand"/>} label="Estado este mes" value={statusMeta[data.metrics.currentStatus].label}/>
      <MetricCard detail={`${data.metrics.paidMonths} meses pagados · ${data.metrics.pendingMonths} pendientes`} icon={<ReceiptText className="size-4 text-brand"/>} label="Arriendo recibido año" value={formatClp(data.metrics.yearReceived)}/>
      <MetricCard detail="Ingreso no recurrente, separado del arriendo mensual" icon={<Landmark className="size-4 text-brand"/>} label="Garantía recibida" value={formatClp(data.metrics.yearGuaranteeReceived)}/>
      <MetricCard detail={data.metrics.nextDueDate ? `Vence ${formatOfficeDate(data.metrics.nextDueDate)}` : "Sin obligación próxima"} icon={<CalendarClock className="size-4 text-brand"/>} label="Próximo vencimiento" value={data.metrics.nextDueDate ? formatOfficeDate(data.metrics.nextDueDate) : "Al día"}/>
    </section>

    <section className="grid gap-3 lg:grid-cols-3">
      <MetricCard icon={<Landmark className="size-4 text-brand"/>} label="Costo bruto oficina" value={formatClp(data.metrics.grossOfficeCost)} detail={`${formatClp(data.settings.mortgageCost)} dividendo + ${formatClp(data.settings.commonExpensesCost)} gastos comunes`}/>
      <MetricCard icon={<Building2 className="size-4 text-brand"/>} label="Ingreso arriendo" value={`-${formatClp(data.metrics.contractedRent)}`} detail="Compensación separada; no elimina los gastos originales"/>
      <MetricCard icon={<WalletCards className="size-4 text-brand"/>} label="Costo neto mensual" value={formatClp(data.metrics.netContractCost)} detail={`${formatClp(data.metrics.grossOfficeCost)} - ${formatClp(data.metrics.contractedRent)}`}/>
    </section>

    <section className="rounded-3xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Control mensual</p><h2 className="mt-1 text-2xl font-semibold">Obligaciones y pagos</h2></div><p className="text-xs text-muted">Cada movimiento conserva fecha, método, usuario, comprobante y recibo.</p></div>
      <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-[.12em] text-muted"><th className="px-3 py-3">Mes</th><th className="px-3 py-3">Monto</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Fecha pago</th><th className="px-3 py-3">Recibo</th><th className="px-3 py-3">Comprobante</th><th className="px-3 py-3 text-right">Acción</th></tr></thead><tbody>{data.months.map((month) => {
        const latest = month.payments[0]; const receipt = latest ? documentsByPayment(latest.id, "INCOME_RECEIPT") : undefined; const proof = latest ? documentsByPayment(latest.id, "PAYMENT_PROOF") : undefined;
        return <tr className="border-b last:border-0" key={month.id}><td className="px-3 py-4 font-semibold">{monthLabel(month.period)}</td><td className="px-3 py-4"><p>{formatClp(month.amountDue)} arriendo</p>{month.guaranteeAmount > 0 ? <p className="text-xs text-brand">{formatClp(month.guaranteeAmount)} garantía · total {formatClp(month.cashReceivedAmount)}</p> : month.receivedAmount > 0 && month.outstandingAmount > 0 ? <p className="text-xs text-muted">{formatClp(month.receivedAmount)} recibido</p> : null}</td><td className="px-3 py-4"><span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusMeta[month.status].className)}>{statusMeta[month.status].label}</span></td><td className="px-3 py-4">{latest ? formatOfficeDate(latest.paidOn) : "—"}</td><td className="px-3 py-4">{receipt ? <DocumentLinks document={receipt}/> : latest ? <Button disabled={receiptPending} onClick={() => startReceipt(async () => { const result = await generateOfficeLeaseReceiptAction(latest.id); setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error }); if (result.ok) router.refresh(); })} size="sm" variant="outline">Generar {receiptLabel(latest.receiptNumber)}</Button> : "—"}</td><td className="px-3 py-4">{proof ? <DocumentLinks document={proof}/> : "—"}</td><td className="px-3 py-4 text-right">{month.outstandingAmount > 0 ? <Button onClick={() => openPayment(month)} size="sm">Registrar pago</Button> : <span className="text-xs text-muted">Cubierto</span>}</td></tr>;
      })}</tbody></table></div>
      <div className="mt-5 space-y-3 md:hidden">{data.months.map((month) => <article className="rounded-2xl border bg-background/35 p-4" key={month.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{monthLabel(month.period)}</p><p className="mt-1 text-sm text-muted">{formatClp(month.amountDue)} arriendo · vence {formatOfficeDate(month.dueDate)}</p>{month.guaranteeAmount > 0 ? <p className="mt-1 text-xs text-brand">Garantía {formatClp(month.guaranteeAmount)} · total recibido {formatClp(month.cashReceivedAmount)}</p> : null}</div><span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", statusMeta[month.status].className)}>{statusMeta[month.status].label}</span></div>{month.payments.map((payment) => { const receipt = documentsByPayment(payment.id, "INCOME_RECEIPT"); const proof = documentsByPayment(payment.id, "PAYMENT_PROOF"); return <div className="mt-3 rounded-xl border p-3 text-xs" key={payment.id}><p>{formatOfficeDate(payment.paidOn)} · {formatClp(payment.amount)} · {payment.paymentMethod}</p>{payment.lineItems.map((item) => <p className="mt-1 text-muted" key={item.id}>{item.description}: {formatClp(item.amount)}</p>)}<div className="mt-2 flex flex-wrap gap-1">{receipt ? <DocumentLinks document={receipt}/> : null}{proof ? <DocumentLinks document={proof}/> : null}</div></div>; })}{month.outstandingAmount > 0 ? <Button className="mt-3 w-full" onClick={() => openPayment(month)} size="sm">Registrar {formatClp(month.outstandingAmount)}</Button> : null}</article>)}</div>
    </section>

    <details className="rounded-3xl border bg-card p-4 sm:p-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span><span className="block text-xs font-semibold uppercase tracking-[.16em] text-brand">Ficha reutilizable</span><span className="mt-1 block text-xl font-semibold">Arrendatario y contrato</span></span><Pencil className="size-4 text-muted"/></summary><div className="mt-5 grid gap-4 border-t pt-5 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><p className="text-xs text-muted">Razón social</p><p className="mt-1 font-medium">{data.settings.tenantLegalName}</p></div><div><p className="text-xs text-muted">RUT</p><p className="mt-1 font-medium">{data.settings.tenantRut}</p></div><div><p className="text-xs text-muted">Representante</p><p className="mt-1 font-medium">{data.settings.tenantRepresentative || "No informado"}</p></div><div><p className="text-xs text-muted">Email</p><p className="mt-1 font-medium">{data.settings.tenantEmail || "No informado"}</p></div><div><p className="text-xs text-muted">Teléfono</p><p className="mt-1 font-medium">{data.settings.tenantPhone || "No informado"}</p></div><div><p className="text-xs text-muted">Vigencia</p><p className="mt-1 font-medium">{data.settings.contractStartDate ? `${formatOfficeDate(data.settings.contractStartDate)}${data.settings.contractEndDate ? ` - ${formatOfficeDate(data.settings.contractEndDate)}` : ""}` : "Pendiente de completar"}</p></div><div className="sm:col-span-2 lg:col-span-3"><p className="text-xs text-muted">Domicilio</p><p className="mt-1 font-medium">{data.settings.tenantAddress}</p></div></div></details>

    <details className="rounded-3xl border bg-card p-4 sm:p-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span><span className="block text-xs font-semibold uppercase tracking-[.16em] text-brand">Archivo documental</span><span className="mt-1 block text-xl font-semibold">Contrato y documentos adicionales</span></span><FileText className="size-4 text-muted"/></summary><div className="mt-5 border-t pt-5"><form className="grid gap-3 rounded-2xl border bg-background/35 p-4 sm:grid-cols-[180px_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget, uploadOfficeLeaseDocumentAction, startDocument, () => setDocumentRequestId("")); }}><input name="requestId" type="hidden" value={documentRequestId || "pending"}/><Field label="Tipo"><select className={inputClass} name="documentType" onFocus={() => { if (!documentRequestId) setDocumentRequestId(crypto.randomUUID()); }}><option value="CONTRACT">Contrato</option><option value="ADDITIONAL">Documento adicional</option></select></Field><Field label="Archivo"><input accept="application/pdf,image/jpeg,image/png" className={cn(inputClass, "py-2")} name="file" onChange={() => { if (!documentRequestId) setDocumentRequestId(crypto.randomUUID()); }} required type="file"/></Field><Button loading={documentPending} loadingLabel="Guardando…" type="submit"><Upload className="size-4"/>Guardar</Button></form><div className="mt-4 space-y-2">{data.documents.filter((document) => ["CONTRACT", "ADDITIONAL"].includes(document.documentType)).map((document) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm" key={document.id}><span><strong>{document.documentType === "CONTRACT" ? "Contrato" : "Adicional"}</strong> · {document.originalFilename}</span><DocumentLinks document={document}/></div>)}{!data.documents.some((document) => ["CONTRACT", "ADDITIONAL"].includes(document.documentType)) ? <p className="text-sm text-muted">Aún no hay contrato ni documentos adicionales cargados.</p> : null}</div></div></details>

    {paymentOpen ? <Modal description="El movimiento y su correlativo se registran una sola vez, aunque el botón se reintente." onClose={() => !paymentPending && setPaymentOpen(false)} title="Registrar pago"><form className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget, registerOfficeLeasePaymentAction, startPayment, () => setPaymentOpen(false)); }}><input name="requestId" type="hidden" value={paymentRequestId}/><Field className="sm:col-span-2" label="Mes"><select className={inputClass} name="obligationId" onChange={(event) => { const month = monthById.get(event.target.value); setPaymentMonthId(event.target.value); setPaymentAmount(month ? String(month.outstandingAmount) : ""); }} required value={paymentMonthId}>{outstandingMonths.map((month) => <option key={month.id} value={month.id}>{monthLabel(month.period)} · saldo {formatClp(month.outstandingAmount)}</option>)}</select></Field><Field label="Monto recibido"><input className={inputClass} max={monthById.get(paymentMonthId)?.outstandingAmount} min="1" name="amount" onChange={(event) => setPaymentAmount(event.target.value)} required step="1" type="number" value={paymentAmount}/></Field><Field label="Fecha real de pago"><input className={inputClass} defaultValue={data.today} name="paidOn" required type="date"/></Field><Field label="Método de pago"><select className={inputClass} name="paymentMethod" required><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="DEPÓSITO">Depósito</option><option value="OTRO">Otro</option></select></Field><Field label="Comprobante"><input accept="application/pdf,image/jpeg,image/png" className={cn(inputClass, "py-2")} name="file" required type="file"/></Field><Field className="sm:col-span-2" label="Observación opcional"><textarea className={cn(inputClass, "min-h-24 py-3")} name="observation" placeholder="Detalle complementario del pago"/></Field><div className="flex flex-col-reverse gap-2 border-t pt-4 sm:col-span-2 sm:flex-row sm:justify-end"><Button disabled={paymentPending} onClick={() => setPaymentOpen(false)} type="button" variant="ghost">Cancelar</Button><Button loading={paymentPending} loadingLabel="Registrando y generando…" type="submit">REGISTRAR PAGO</Button></div></form></Modal> : null}

    {settingsOpen ? <Modal description="Los cambios futuros se reutilizan automáticamente sin alterar meses históricos ya creados." onClose={() => !settingsPending && setSettingsOpen(false)} title="Administrar arriendo"><form className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget, saveOfficeLeaseSettingsAction, startSettings, () => setSettingsOpen(false)); }}><input name="version" type="hidden" value={data.settings.version}/><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand sm:col-span-2">Datos del arrendatario</p><Field label="Razón social / nombre"><input className={inputClass} defaultValue={data.settings.tenantLegalName} name="tenantLegalName" required/></Field><Field label="RUT"><input className={inputClass} defaultValue={data.settings.tenantRut} name="tenantRut" required/></Field><Field className="sm:col-span-2" label="Dirección"><input className={inputClass} defaultValue={data.settings.tenantAddress} name="tenantAddress" required/></Field><Field label="Email"><input className={inputClass} defaultValue={data.settings.tenantEmail} name="tenantEmail" type="email"/></Field><Field label="Teléfono"><input className={inputClass} defaultValue={data.settings.tenantPhone} name="tenantPhone"/></Field><Field label="Representante"><input className={inputClass} defaultValue={data.settings.tenantRepresentative} name="tenantRepresentative"/></Field><Field label="Inicio contrato"><input className={inputClass} defaultValue={data.settings.contractStartDate} name="contractStartDate" type="date"/></Field><Field label="Término contrato"><input className={inputClass} defaultValue={data.settings.contractEndDate} name="contractEndDate" type="date"/></Field><Field className="sm:col-span-2" label="Observaciones"><textarea className={cn(inputClass, "min-h-24 py-3")} defaultValue={data.settings.observations} name="observations"/></Field><p className="mt-2 text-xs font-semibold uppercase tracking-[.16em] text-brand sm:col-span-2">Configuración del arriendo</p><Field label="Unidad"><input className={inputClass} defaultValue={data.settings.unitName} name="unitName" required/></Field><Field label="Concepto"><input className={inputClass} defaultValue={data.settings.concept} name="concept" required/></Field><Field className="sm:col-span-2" label="Dirección del inmueble"><input className={inputClass} defaultValue={data.settings.propertyAddress} name="propertyAddress"/></Field><Field label="Valor mensual"><input className={inputClass} defaultValue={data.settings.monthlyAmount} min="1" name="monthlyAmount" required step="1" type="number"/></Field><Field label="Día vencimiento"><input className={inputClass} defaultValue={data.settings.dueDay} max="28" min="1" name="dueDay" required type="number"/></Field><Field label="Dividendo"><input className={inputClass} defaultValue={data.settings.mortgageCost} min="0" name="mortgageCost" required step="1" type="number"/></Field><Field label="Gastos comunes"><input className={inputClass} defaultValue={data.settings.commonExpensesCost} min="0" name="commonExpensesCost" required step="1" type="number"/></Field><label className="flex min-h-11 items-center gap-3 rounded-xl border bg-background px-3 text-sm sm:col-span-2"><input defaultChecked={data.settings.commonExpensesIncluded} name="commonExpensesIncluded" type="checkbox"/><span>Gastos comunes incluidos en el arriendo</span></label><div className="flex flex-col-reverse gap-2 border-t pt-4 sm:col-span-2 sm:flex-row sm:justify-end"><Button disabled={settingsPending} onClick={() => setSettingsOpen(false)} type="button" variant="ghost">Cancelar</Button><Button loading={settingsPending} loadingLabel="Guardando…" type="submit">Guardar configuración</Button></div></form></Modal> : null}
  </main>;
}

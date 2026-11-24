"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Mail, ShieldAlert } from "lucide-react";
import type { ReceivableInvoice } from "./types";
import { consolidatedCollectionFingerprint, groupReceivablesByCustomer, isSpWeddingCustomer, type ConsolidatedCollection } from "./consolidated-collection";
import { previewConsolidatedCollectionAction, sendConsolidatedCollectionAction, sendConsolidatedCollectionTestAction } from "./consolidated-collection.actions";

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(`${value.slice(0, 10)}T12:00:00-04:00`)) : "Sin fecha";
type Preview = { customerId: string; invoiceIds: string[]; html: string; recipient: string; subject: string; totalOutstanding: number };

export function ConsolidatedCollectionCenter({ invoices }: { invoices: readonly ReceivableInvoice[] }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const groups = useMemo(() => groupReceivablesByCustomer(invoices, today).filter((group) => {
    const haystack = [group.customerName, group.customerCompany ?? "", group.customerEmail ?? "", ...group.lines.map((line) => `${line.invoice.projectName} ${line.invoice.invoiceNumber}`)].join(" ").toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  }), [invoices, query, today]);

  useEffect(() => {
    setSelected((current) => {
      const next = { ...current };
      let changed = false;
      for (const group of groups) {
        if (group.customerId in next) continue;
        next[group.customerId] = isSpWeddingCustomer(group.customerId) ? group.lines.map((line) => line.invoice.id) : group.lines.filter((line) => line.overdue).map((line) => line.invoice.id);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [groups]);

  function toggle(group: ConsolidatedCollection, invoiceId: string) {
    setSelected((current) => {
      const ids = new Set(current[group.customerId] ?? []);
      if (ids.has(invoiceId)) ids.delete(invoiceId); else ids.add(invoiceId);
      return { ...current, [group.customerId]: [...ids] };
    });
  }

  function selectAll(group: ConsolidatedCollection) {
    setSelected((current) => ({ ...current, [group.customerId]: group.lines.map((line) => line.invoice.id) }));
  }

  function buildForm(group: ConsolidatedCollection, ids: string[]) {
    const selectedLines = group.lines.filter((line) => ids.includes(line.invoice.id));
    const oldestOverdue = selectedLines.find((line) => line.overdue);
    const selectedGroup = { ...group, lines: selectedLines, overdueTotal: selectedLines.filter((line) => line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0), upcomingTotal: selectedLines.filter((line) => !line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0), totalOutstanding: selectedLines.reduce((sum, line) => sum + line.invoice.outstandingBalance, 0), oldestDueDate: oldestOverdue?.invoice.dueDate ?? null, oldestOverdueDays: oldestOverdue?.overdueDays ?? 0, oldestTermDays: oldestOverdue?.invoice.canonicalPaymentTermDays ?? null };
    const form = new FormData();
    form.set("customerId", group.customerId);
    ids.forEach((id) => form.append("invoiceIds", id));
    form.set("expectedFingerprint", consolidatedCollectionFingerprint(selectedGroup, ids));
    return form;
  }

  function openPreview(group: ConsolidatedCollection) {
    const ids = selected[group.customerId] ?? [];
    if (!ids.length) { setMessage("Selecciona al menos un evento."); return; }
    setMessage(null);
    setTestSent(false);
    const form = buildForm(group, ids);
    startTransition(async () => {
      const result = await previewConsolidatedCollectionAction(form);
      if (result.ok) setPreview({ customerId: group.customerId, invoiceIds: ids, ...result });
      else setMessage(result.error);
    });
  }

  function sendQaTest() {
    if (!preview) return;
    const group = groups.find((item) => item.customerId === preview.customerId);
    if (!group) { setMessage("La selección cambió. Recarga la cobranza consolidada."); return; }
    const form = buildForm(group, preview.invoiceIds);
    startTransition(async () => {
      const result = await sendConsolidatedCollectionTestAction(form);
      if (result.ok) {
        setTestSent(true);
        setMessage(`Prueba enviada a ${result.recipient}; no se registró como cobranza.`);
      } else setMessage(result.error);
    });
  }

  function confirmSend() {
    if (!preview) return;
    const group = groups.find((item) => item.customerId === preview.customerId);
    if (!group) { setPreview(null); setMessage("La selección cambió. Recarga la cobranza consolidada."); return; }
    const form = buildForm(group, preview.invoiceIds);
    form.set("requestId", crypto.randomUUID());
    startTransition(async () => {
      const result = await sendConsolidatedCollectionAction(form);
      setPreview(null);
      setMessage(result.ok ? `${result.deduplicated ? "Cobranza ya registrada" : "Cobranza enviada"} a ${result.recipient}.` : result.error);
    });
  }

  return <section className="rounded-2xl border bg-card p-4 sm:p-5" data-testid="consolidated-customer-collections">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Cobranza por cliente</p><h2 className="mt-1 text-xl font-semibold">Obligaciones consolidadas</h2><p className="mt-1 text-sm text-muted">Los eventos vencidos quedan seleccionados inicialmente; los saldos se revalidan antes de mostrar y enviar.</p></div>
      <input aria-label="Buscar cobranza por cliente" className="min-h-10 rounded-xl border bg-background px-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente o evento" value={query} />
    </div>
    {message ? <p className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm" role="status">{message}</p> : null}
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {groups.map((group) => {
        const ids = selected[group.customerId] ?? [];
        const selectedTotal = group.lines.filter((line) => ids.includes(line.invoice.id)).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0);
        return <article className="rounded-2xl border bg-background/40 p-4" key={group.customerId}>
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{group.customerCompany ?? group.customerName}</h3>{group.customerCompany ? <p className="mt-1 text-sm text-muted">Contacto: {group.customerName}</p> : null}<p className="text-xs text-muted">{group.customerEmail ?? "Sin email"}{group.customerRut ? ` · RUT ${group.customerRut}` : " · RUT no informado"}</p><p className="text-xs text-muted">{group.lines.length} evento{group.lines.length === 1 ? "" : "s"}</p></div><div className="text-right"><p className="text-xl font-semibold text-danger">{money(group.overdueTotal)}</p><p className="text-xs text-muted">Total vencido</p></div></div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg border p-2"><dt className="text-xs text-muted">Por vencer</dt><dd className="font-semibold">{money(group.upcomingTotal)}</dd></div><div className="rounded-lg border p-2"><dt className="text-xs text-muted">Deuda total</dt><dd className="font-semibold">{money(group.totalOutstanding)}</dd></div><div className="rounded-lg border p-2"><dt className="text-xs text-muted">Mora máxima</dt><dd className="font-semibold">{group.oldestOverdueDays} días</dd></div><div className="rounded-lg border p-2"><dt className="text-xs text-muted">Plazos</dt><dd className="font-semibold">{group.hasMixedTerms ? "Mixtos" : "Consistentes"}</dd></div></dl>
          {group.lastCollectionSentAt ? <p className="mt-3 text-xs text-muted">Último aviso enviado: {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(group.lastCollectionSentAt))}</p> : null}
          {group.reviewRequired ? <p className="mt-3 flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2 text-xs"><ShieldAlert className="size-4 shrink-0" />Revisión requerida: RUT contradictorio o destinatario no verificado.</p> : null}
          <div className="mt-4 space-y-2">{group.lines.map(({ invoice, overdue, overdueDays }) => <label className="flex cursor-pointer gap-3 rounded-xl border p-3" key={invoice.id}><input checked={ids.includes(invoice.id)} className="mt-1 size-4" onChange={() => toggle(group, invoice.id)} type="checkbox" /><span className="min-w-0 flex-1"><span className="block font-medium">{invoice.projectName}</span><span className="block text-xs text-muted">{date(invoice.eventDate)} · {invoice.service} · {invoice.invoiceNumber}</span><span className="block text-xs">Total {money(invoice.amount)} · Abonos {money(invoice.paidAmount)} · Saldo <strong>{money(invoice.outstandingBalance)}</strong> · {overdue ? `${overdueDays} días vencido` : `Vence ${date(invoice.dueDate)}`}</span></span></label>)}</div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><button className="min-h-10 rounded-lg border px-3 text-xs font-semibold" onClick={() => selectAll(group)} type="button">SELECCIONAR TODOS</button><span className="text-sm font-semibold">Total seleccionado: {money(selectedTotal)}</span><button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-foreground disabled:opacity-50" disabled={isPending || group.reviewRequired || !ids.length || !group.customerEmail} onClick={() => openPreview(group)} type="button"><Mail className="size-4" />{isPending ? "GENERANDO VISTA PREVIA…" : "REVISAR Y ENVIAR COBRANZA GLOBAL"}</button></div>
        </article>;
      })}
      {!groups.length ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted xl:col-span-2">No hay saldos activos para esa búsqueda.</p> : null}
    </div>
    {preview ? <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" role="dialog"><div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-card p-4 shadow-2xl"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Vista previa real del correo</p><h3 className="font-semibold">{preview.subject}</h3><p className="text-xs text-muted">Para {preview.recipient} · Total seleccionado {money(preview.totalOutstanding)}</p></div><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setPreview(null)} type="button">Cerrar</button></div><iframe className="mt-3 min-h-[55vh] w-full rounded-xl border bg-white" sandbox="" srcDoc={preview.html} title="Vista previa del correo premium" /><p className="mt-3 rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs leading-relaxed">La prueba se enviará solo a matias.maira.larrain@gmail.com, sin copia y sin registrarse como cobranza. El envío al cliente es una acción separada.</p><div className="mt-3 flex flex-wrap justify-end gap-2"><button className="rounded-lg border px-4 py-2 text-sm" disabled={isPending || testSent} onClick={sendQaTest} type="button">{testSent ? "PRUEBA ENVIADA" : isPending ? "ENVIANDO PRUEBA…" : "ENVIAR PRUEBA A MATÍAS"}</button><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setPreview(null)} type="button">Cancelar</button><button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground" disabled={isPending} onClick={confirmSend} type="button">{isPending ? "ENVIANDO…" : "CONFIRMAR Y ENVIAR"}</button></div></div></div> : null}
  </section>;
}

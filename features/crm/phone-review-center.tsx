"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, CircleAlert, GitMerge, Save, ShieldCheck } from "lucide-react";
import { reviewCustomerPhoneAction, type PhoneReviewDecision } from "./actions";
import type { PhoneReviewData, PhoneReviewRecord } from "./phone-review-repository";

type ReviewTab = "AMBIGUOUS" | "DUPLICATES" | "EMPTY" | "REVIEWED";

export function PhoneReviewCenter({ initialData }: { initialData: PhoneReviewData }) {
  const [tab, setTab] = useState<ReviewTab>("AMBIGUOUS");
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState(initialData);

  const visible = useMemo(() => {
    if (tab === "REVIEWED") return data.records.filter((row) => row.reviewedAt);
    if (tab === "DUPLICATES") return data.records.filter((row) => row.status === "DUPLICATE_REVIEW" && !row.reviewedAt);
    if (tab === "EMPTY") return data.records.filter((row) => row.status === "EMPTY" && !row.reviewedAt);
    return data.records.filter((row) => row.status === "AMBIGUOUS" && !row.reviewedAt);
  }, [data.records, tab]);

  const refreshLocal = (customerIds: string[], decision: PhoneReviewDecision, phone?: string) => {
    setData((current) => ({
      ...current,
      records: current.records.map((row) => customerIds.includes(row.id)
        ? {
            ...row,
            phone: decision === "CANONICALIZED" ? phone ?? row.phone : row.phone,
            phoneE164: decision === "CANONICALIZED" ? phone ?? row.phoneE164 : row.phoneE164,
            status: decision === "CANONICALIZED" ? "VALID_E164" : decision === "NO_PHONE" ? "EMPTY" : row.status,
            reviewedAt: new Date().toISOString(),
            reviewedDecision: decision,
          }
        : row),
      counts: {
        ambiguous: current.records.filter((row) => row.status === "AMBIGUOUS" && !row.reviewedAt && !customerIds.includes(row.id)).length,
        duplicates: current.records.filter((row) => row.status === "DUPLICATE_REVIEW" && !row.reviewedAt && !customerIds.includes(row.id)).length,
        empty: current.records.filter((row) => row.status === "EMPTY" && !row.reviewedAt && !customerIds.includes(row.id)).length,
        reviewed: current.records.filter((row) => Boolean(row.reviewedAt) || customerIds.includes(row.id)).length,
      },
    }));
  };

  const save = (customerIds: string[], decision: PhoneReviewDecision, phone?: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await reviewCustomerPhoneAction({ customerIds, decision, phone });
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      refreshLocal(customerIds, decision, phone);
      setMessage({ kind: "success", text: "Revisión guardada y auditada correctamente." });
    });
  };

  const groups = new Map<string, PhoneReviewRecord[]>();
  for (const row of visible) {
    const key = tab === "DUPLICATES" ? row.duplicateGroup ?? row.id : row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return <div className="space-y-7">
    <header className="border-b pb-7">
      <p className="text-xs uppercase tracking-[.18em] text-muted">Administración · Clientes</p>
      <h1 className="mt-2 text-3xl font-semibold">Revisión de teléfonos</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">Normaliza sólo números internacionales explícitos. No se infiere país, no se fusionan clientes y cada decisión queda auditada.</p>
    </header>
    <div className="grid gap-2 sm:grid-cols-4" role="tablist" aria-label="Filtros de revisión">
      {([['AMBIGUOUS', `Ambiguos (${data.counts.ambiguous})`], ['DUPLICATES', `Duplicados (${data.counts.duplicates})`], ['EMPTY', `Sin teléfono (${data.counts.empty})`], ['REVIEWED', `Revisados (${data.counts.reviewed})`]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-xl border px-3 py-3 text-left text-sm ${tab === value ? "border-brand bg-brand/10" : "bg-card"}`}>{label}</button>)}
    </div>
    {message && <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.kind === "error" ? "border-red-400/30 text-red-300" : "border-emerald-400/30 text-emerald-300"}`}>{message.text}</p>}
    {tab === "DUPLICATES" && <p className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200"><GitMerge className="size-4"/>Los registros permanecen separados hasta una decisión explícita del Founder.</p>}
    {groups.size === 0 ? <div className="rounded-2xl border border-dashed py-16 text-center text-muted">No hay registros en esta revisión.</div> : <div className="space-y-4">{[...groups.entries()].map(([group, rows]) => <section className="rounded-2xl border bg-card p-5" key={group}><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">{rows.length > 1 ? `Grupo ${rows[0].duplicateGroup}` : rows[0].fullName}</h2><p className="text-xs text-muted">{rows.length > 1 ? "Todos los clientes se muestran lado a lado." : rows[0].company || "Cliente particular"}</p></div>{rows[0].reviewedAt && <span className="text-xs text-emerald-300"><Check className="mr-1 inline size-3.5"/>Revisado</span>}</div><div className="grid gap-4 lg:grid-cols-2">{rows.map((row) => <PhoneReviewRow key={row.id} row={row} tab={tab} value={phones[row.id] ?? ""} onChange={(value) => setPhones((current) => ({ ...current, [row.id]: value }))} pending={pending} onSave={(decision, phone) => save([row.id], decision, phone)} onSaveGroup={(decision) => save(rows.map((item) => item.id), decision)} />)}</div></section>)}</div>}
  </div>;
}

function PhoneReviewRow({ row, tab, value, onChange, pending, onSave, onSaveGroup }: { row: PhoneReviewRecord; tab: ReviewTab; value: string; onChange: (value: string) => void; pending: boolean; onSave: (decision: PhoneReviewDecision, phone?: string) => void; onSaveGroup: (decision: PhoneReviewDecision) => void }) {
  const reviewed = Boolean(row.reviewedAt);
  return <article className="rounded-xl border border-border/70 p-4"><div className="grid gap-2 text-sm sm:grid-cols-2"><div><p className="font-semibold">{row.fullName}</p><p className="text-xs text-muted">{row.company || "Cliente particular"}</p></div><div className="text-xs text-muted sm:text-right">ID: {row.id}</div><p>Legacy: <span className="font-medium">{row.phone || "—"}</span></p><p>phone_e164: <span className="font-medium">{row.phoneE164 || "NULL"}</span></p><p>Estado: <span className="font-medium">{reviewed ? row.reviewedDecision : row.status}</span></p><p>Contexto: {row.projects} proyectos · {row.quotes} cotizaciones · {row.reservations} reservas · {row.invoices} facturas{row.hasPaidHistory ? " · pagos registrados" : ""}</p></div>{!reviewed && tab !== "REVIEWED" && <div className="mt-4 space-y-3"><label className="block text-sm"><span className="mb-1 block text-muted">Número internacional explícito</span><input className="h-10 w-full rounded-lg border bg-background px-3" placeholder="+56... / +57... / +1... / +54..." value={value} onChange={(event) => onChange(event.target.value)} /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => onSave("CANONICALIZED", value)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><Save className="size-3.5"/>Guardar número</button>{tab === "EMPTY" && <button type="button" disabled={pending} onClick={() => onSave("NO_PHONE")} className="rounded-lg border px-3 py-2 text-xs">Marcar sin teléfono</button>}{tab === "DUPLICATES" ? <button type="button" disabled={pending} onClick={() => onSaveGroup("KEEP_SEPARATE")} className="rounded-lg border px-3 py-2 text-xs">Mantener separados</button> : <button type="button" disabled={pending} onClick={() => onSave("LEFT_UNRESOLVED")} className="rounded-lg border px-3 py-2 text-xs">Dejar pendiente</button>}{tab !== "DUPLICATES" && <button type="button" disabled={pending} onClick={() => onSave("MARK_REVIEWED")} className="rounded-lg border px-3 py-2 text-xs">Marcar revisado</button>}</div></div>}{reviewed && <p className="mt-4 flex items-center gap-2 text-xs text-emerald-300"><ShieldCheck className="size-4"/>Decisión auditada; no se modificó historial comercial.</p>}{row.status === "AMBIGUOUS" && !row.phone.startsWith("+") && !reviewed && <p className="mt-3 flex items-center gap-2 text-xs text-amber-200"><CircleAlert className="size-4"/>No se convertirá automáticamente. Ingresa el prefijo internacional completo.</p>}</article>;
}

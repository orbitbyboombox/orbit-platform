"use client";
import { Check, CircleDollarSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markFinancialAlertPaidAction } from "./actions";

export type FinancialAlertView = { id: string; key: string; title: string; status: "PENDING" | "PAID"; period: string; paidAt: string | null };

export function FinancialAlertCenter({ current, history }: { current: FinancialAlertView | null; history: FinancialAlertView[] }) {
  const router = useRouter();
  const [message,setMessage]=useState("");
  const [pending,startTransition]=useTransition();
  if (!current && !history.length) return null;
  return <section data-command-card id="financial-alerts" className="rounded-2xl border p-5 sm:p-6">
    <p data-command-label>Obligaciones financieras</p>
    {current ? <div className={`mt-4 rounded-2xl border p-4 ${current.title.endsWith("HOY") ? "border-danger/40 bg-danger/5" : "border-warning/40 bg-warning/5"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning"><CircleDollarSign className="size-5" /></span><span><strong className="block text-base">{current.title}</strong><span className="text-xs text-muted">Período {current.period} · obligación pendiente</span></span></span><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-xs font-semibold text-brand-foreground disabled:opacity-50" disabled={pending} onClick={()=>startTransition(async()=>{const result=await markFinancialAlertPaidAction(current.id);setMessage(result.message);if(result.ok)router.refresh();})}><Check className="size-4" />{pending?"Registrando…":"Marcar como pagado"}</button></div>
    </div> : null}
    {message ? <p aria-live="polite" className="mt-3 text-xs text-muted">{message}</p> : null}
    <details className="mt-4 rounded-xl border bg-background/30 p-4"><summary className="cursor-pointer text-sm font-semibold text-brand">Ver historial</summary><div className="mt-3 divide-y">{history.map(item=><div className="flex items-center justify-between gap-3 py-3 text-xs" key={item.id}><span>{item.key}</span><span className={item.status==="PAID"?"text-success":"text-warning"}>{item.status==="PAID"?`Pagado · ${item.paidAt?.slice(0,10)}`:"Pendiente"}</span></div>)}</div></details>
  </section>;
}

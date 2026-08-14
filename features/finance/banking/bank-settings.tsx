"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { saveRecurringExpenseRuleAction } from "./actions";
import type { BankAccount, RecurringExpenseRule } from "./types";

const money = (value: number, currency: "CLP" | "USD" = "CLP") =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(value);

export function BankSettings({ accounts, rules }: { accounts: BankAccount[]; rules: RecurringExpenseRule[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return <section className="rounded-3xl border bg-card p-5 sm:p-7">
    <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Settings · Finance</p>
    <h2 className="mt-2 text-xl font-semibold">Cuentas bancarias y gastos recurrentes</h2>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">{accounts.map((account) => <div className="rounded-xl border p-4" key={account.id}><strong>{account.name}</strong><p className="mt-1 text-sm text-muted">{account.accountType}{account.primary ? " · Principal" : ""}</p></div>)}</div>
    <div className="mt-6"><h3 className="font-semibold">Reglas activas</h3><div className="mt-3 space-y-2">{rules.map((rule) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm" key={rule.id}><span><strong>{rule.name}</strong><small className="block text-muted">{rule.provider ? `${rule.provider} · ` : ""}{rule.frequency} · próximo {rule.nextDueDate}</small></span><strong>{money(rule.amount, rule.currency)}</strong></div>)}</div></div>
    <form action={(form) => start(async () => { const result = await saveRecurringExpenseRuleAction(form); setMessage(result.ok ? "Regla guardada. El gasto se generará sin duplicados." : result.error ?? ""); })} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input name="id" type="hidden" />
      <label className="text-sm"><span className="mb-1 block text-muted">Concepto</span><input className="min-h-11 w-full rounded-xl border bg-background px-3" name="name" placeholder="Hosting" required /></label>
      <label className="text-sm"><span className="mb-1 block text-muted">Proveedor</span><input className="min-h-11 w-full rounded-xl border bg-background px-3" name="provider" placeholder="Supabase" /></label>
      <label className="text-sm"><span className="mb-1 block text-muted">Cuenta</span><select className="min-h-11 w-full rounded-xl border bg-background px-3" name="bankAccountId"><option value="">General</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="text-sm"><span className="mb-1 block text-muted">Monto</span><input className="min-h-11 w-full rounded-xl border bg-background px-3" min="0.01" name="amount" required step="0.01" type="number" /></label>
      <label className="text-sm"><span className="mb-1 block text-muted">Moneda</span><select className="min-h-11 w-full rounded-xl border bg-background px-3" name="currency"><option value="CLP">CLP</option><option value="USD">USD</option></select></label>
      <label className="text-sm"><span className="mb-1 block text-muted">Frecuencia</span><select className="min-h-11 w-full rounded-xl border bg-background px-3" name="frequency"><option value="MONTHLY">Mensual</option><option value="QUARTERLY">Trimestral</option><option value="ANNUAL">Anual</option></select></label>
      <input name="category" type="hidden" value="ADMINISTRATION" /><input name="dueDay" type="hidden" value="1" /><input name="active" type="hidden" value="on" />
      <label className="text-sm"><span className="mb-1 block text-muted">Primer vencimiento</span><input className="min-h-11 w-full rounded-xl border bg-background px-3" defaultValue={new Date().toISOString().slice(0, 10)} name="nextDueDate" required type="date" /></label>
      <Button className="self-end" disabled={pending}>{pending ? "Guardando…" : "Crear regla recurrente"}</Button>
    </form>
    {message && <p className="mt-3 text-sm text-muted">{message}</p>}
  </section>;
}

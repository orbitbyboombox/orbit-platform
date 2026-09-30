"use client";

import { useState } from "react";
import type { CollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";

function bankText(bank: CollectionBankDetails) {
  return [
    bank.companyLabel,
    `Banco: ${bank.bankName}`,
    `Tipo de cuenta: ${bank.accountType}`,
    `N° de cuenta: ${bank.accountNumber}`,
    `RUT: ${bank.rut}`,
    `Email comprobante: ${bank.email}`,
  ].join("\n");
}

async function copyWithFallback(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function BankDetailsCopyCard({
  bank,
}: {
  bank: CollectionBankDetails;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyWithFallback(bankText(bank));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#15171b]">
        <Row label="Titular" value={bank.companyLabel} />
        <Row label="Banco" value={bank.bankName} />
        <Row label="Tipo de cuenta" value={bank.accountType} />
        <Row label="N° de cuenta" value={bank.accountNumber} />
        <Row label="RUT" value={bank.rut} />
        <Row label="Email comprobante" value={bank.email} last />
      </div>

      <button
        className="min-h-14 w-full rounded-2xl bg-[#F78900] px-5 text-sm font-extrabold tracking-wide text-black transition hover:brightness-105 active:scale-[0.99]"
        onClick={copy}
        type="button"
      >
        {copied ? "✓ DATOS COPIADOS" : "COPIAR DATOS BANCARIOS"}
      </button>

      <p className="text-center text-xs leading-5 text-white/50">
        Después de copiar, abre tu banco y pega los datos donde corresponda.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={`grid gap-1 px-5 py-4 sm:grid-cols-[145px_1fr] sm:gap-4 ${last ? "" : "border-b border-white/10"}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
        {label}
      </span>
      <strong className="break-words text-sm font-semibold text-white sm:text-right">
        {value}
      </strong>
    </div>
  );
}

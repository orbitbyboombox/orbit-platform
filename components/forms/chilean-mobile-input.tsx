"use client";

import { normalizeChileanMobileLocal, normalizeChileanPhone } from "@/lib/chile/rut";

export function ChileanMobileInput({ value, onChange, disabled, required, id, name }: {
  value: string;
  onChange: (canonical: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
}) {
  const local = normalizeChileanMobileLocal(value);
  return <span className="flex min-w-0 items-center rounded-xl border bg-background pl-3 focus-within:ring-2">
    <span aria-hidden className="shrink-0 text-sm text-muted">+56 9</span>
    <input
      aria-label="Teléfono móvil, ocho dígitos después de más cincuenta y seis nueve"
      autoComplete="tel-national"
      className="min-w-0 flex-1 border-0 bg-transparent"
      disabled={disabled}
      id={id}
      inputMode="numeric"
      maxLength={8}
      name={name}
      pattern="[0-9]{8}"
      placeholder="99690487"
      required={required}
      type="tel"
      value={local}
      onChange={(event) => onChange(normalizeChileanPhone(event.target.value))}
      onPaste={(event) => {
        event.preventDefault();
        onChange(normalizeChileanPhone(event.clipboardData.getData("text")));
      }}
    />
  </span>;
}

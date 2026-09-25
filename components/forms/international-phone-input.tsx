"use client";

import { cleanPhoneInput } from "@/lib/phone/e164";

export function InternationalPhoneInput({ value, onChange, disabled, required, id, name }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
}) {
  return <span className="block">
    <input
      aria-label="Teléfono internacional con prefijo +"
      autoComplete="tel"
      className="h-12 w-full rounded-xl border bg-background px-4"
      disabled={disabled}
      id={id}
      inputMode="tel"
      name={name}
      placeholder="+56912345678 o +573001234567"
      required={required}
      type="tel"
      value={value}
      onChange={(event) => onChange(cleanPhoneInput(event.target.value))}
    />
  </span>;
}

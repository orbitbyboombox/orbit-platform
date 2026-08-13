"use client";

import { useState } from "react";
import { formatChileanRut, isValidChileanRut } from "@/lib/chile/rut";
import { cn } from "@/lib/utils";

export function RutInput({
  className,
  defaultValue = "",
  name = "rut",
  onChange,
  required = true,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "name" | "type"> & {
  defaultValue?: string;
  name?: string;
}) {
  const [value, setValue] = useState(() => formatChileanRut(defaultValue));
  const complete = value.replace(/[^0-9K]/gi, "").length >= 8;
  const invalid = complete && !isValidChileanRut(value);
  return (
    <span className="block">
      <input
        {...props}
        aria-invalid={invalid}
        autoCapitalize="characters"
        autoComplete="username"
        className={cn(className, invalid && "border-danger focus:border-danger")}
        inputMode="text"
        name={name}
        required={required}
        type="text"
        value={value}
        onChange={(event) => {
          const formatted = formatChileanRut(event.target.value);
          setValue(formatted);
          event.target.value = formatted;
          onChange?.(event);
        }}
      />
      {invalid ? (
        <span className="mt-1.5 block text-xs text-danger" role="alert">
          El RUT no es válido. Revisa el dígito verificador.
        </span>
      ) : null}
    </span>
  );
}

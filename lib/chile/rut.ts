export function normalizeChileanRut(value: string) {
  return value.toUpperCase().replace(/[^0-9K]/g, "").slice(0, 9);
}

export function formatChileanRut(value: string) {
  const normalized = normalizeChileanRut(value);
  if (normalized.length < 2) return normalized;
  const body = normalized.slice(0, -1);
  const verifier = normalized.slice(-1);
  return `${Number(body).toLocaleString("es-CL")}-${verifier}`;
}

export function isValidChileanRut(value: string) {
  const normalized = normalizeChileanRut(value);
  if (normalized.length < 8) return false;
  const body = normalized.slice(0, -1);
  const verifier = normalized.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  const expected = result === 11 ? "0" : result === 10 ? "K" : String(result);
  return verifier === expected;
}

export function requireValidChileanRut(value: string) {
  const normalized = normalizeChileanRut(value);
  if (!isValidChileanRut(normalized))
    throw new Error("El RUT ingresado no es válido. Revisa el dígito verificador.");
  return normalized;
}

export function normalizeChileanPhone(value: string) {
  const local = normalizeChileanMobileLocal(value);
  return local ? `569${local}` : "";
}

/** Eight digits shown after ORBIT's fixed +56 9 mobile prefix. */
export function normalizeChileanMobileLocal(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits === "569") return "";
  if (digits.length > 8 && digits.startsWith("569")) digits = digits.slice(3);
  else if (digits.length > 8 && digits.startsWith("56")) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith("9")) digits = digits.slice(1);
  return digits.slice(0, 8);
}

/** Keeps partial typing local and emits the canonical 569XXXXXXXX only when complete. */
export function normalizeChileanMobileInput(value: string) {
  const local = value.replace(/\D/g, "").slice(0, 8);
  return local.length === 8 ? `569${local}` : local;
}

export function formatChileanPhone(value: string) {
  const normalized = normalizeChileanPhone(value);
  if (normalized.length !== 11) return value;
  return `+56 9 ${normalized.slice(3, 7)} ${normalized.slice(7, 11)}`;
}

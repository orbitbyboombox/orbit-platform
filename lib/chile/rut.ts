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
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("56")) return digits.slice(0, 11);
  if (digits.startsWith("9")) return `56${digits.slice(0, 9)}`;
  return digits.slice(0, 11);
}

export function formatChileanPhone(value: string) {
  const normalized = normalizeChileanPhone(value);
  if (normalized.length !== 11 || !normalized.startsWith("569")) return value;
  return `+56 9 ${normalized.slice(3, 7)} ${normalized.slice(7, 11)}`;
}

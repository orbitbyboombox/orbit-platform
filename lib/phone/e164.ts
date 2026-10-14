const E164_DIGITS = /^\+[0-9]{8,15}$/;

/** Removes presentation punctuation without inventing a country code. */
export function cleanPhoneInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("+") && (!trimmed.startsWith("+") || trimmed.slice(1).includes("+"))) return "";
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return `${hasPlus ? "+" : ""}${digits}`;
}

/** Canonical customer-phone contract. Only explicit international prefixes are accepted. */
export function normalizePhoneE164(value: string | null | undefined) {
  const canonical = cleanPhoneInput(value ?? "");
  return E164_DIGITS.test(canonical) ? canonical : "";
}

export function isPhoneE164(value: string | null | undefined) {
  return E164_DIGITS.test(value ?? "");
}

export function requirePhoneE164(value: string) {
  const normalized = normalizePhoneE164(value);
  if (!normalized) {
    throw new Error("Ingresa un teléfono internacional válido con prefijo +.");
  }
  return normalized;
}

export function formatPhoneE164(value: string | null | undefined) {
  return normalizePhoneE164(value) || value?.trim() || "";
}

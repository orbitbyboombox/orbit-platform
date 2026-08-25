const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export class RecipientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipientValidationError";
  }
}

export function normalizeOptionalEmail(
  value: string | null | undefined,
  label = "correo",
): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (!emailPattern.test(normalized)) {
    throw new RecipientValidationError(`El ${label} no es válido.`);
  }
  return normalized;
}

export function normalizeRequiredEmail(value: string, label = "correo principal") {
  const normalized = normalizeOptionalEmail(value, label);
  if (!normalized) {
    throw new RecipientValidationError(`El ${label} es obligatorio.`);
  }
  return normalized;
}

function ccValues(value: string | readonly string[] | null | undefined) {
  return (Array.isArray(value) ? value : String(value ?? "").split(/[\n,;]+/))
    .map((item) => String(item).trim())
    .filter(Boolean);
}

export function normalizeCcRecipients(
  value: string | readonly string[] | null | undefined,
  primaryEmail: string,
): string[] {
  const primary = normalizeRequiredEmail(primaryEmail);
  const seen = new Set([primary]);
  const recipients: string[] = [];
  for (const item of ccValues(value)) {
    const email = normalizeRequiredEmail(item, "correo CC");
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push(email);
  }
  return recipients;
}

export function normalizeEmailRecipients(input: {
  to: string;
  cc?: string | readonly string[] | null;
}) {
  const to = normalizeRequiredEmail(input.to);
  return { to, cc: normalizeCcRecipients(input.cc, to) };
}

export function isValidOptionalEmail(value: string | null | undefined) {
  try {
    normalizeOptionalEmail(value);
    return true;
  } catch {
    return false;
  }
}

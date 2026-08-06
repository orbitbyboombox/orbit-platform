import type { StaffImportCapability, StaffImportIssue, StaffImportPreview, StaffImportRole, StaffImportRow, StaffImportSpecialization, StaffImportStatus } from "./types";

const CAPABILITIES: Readonly<Record<StaffImportRole, readonly StaffImportCapability[]>> = {
  CALYPSO: ["ASSEMBLY", "OPERATOR", "DISASSEMBLY"], GREEN: ["OPERATOR"],
};
const capabilityAliases: Readonly<Record<string, StaffImportCapability>> = {
  ASSEMBLY: "ASSEMBLY", MONTAJE: "ASSEMBLY", OPERATOR: "OPERATOR", OPERADOR: "OPERATOR", DISASSEMBLY: "DISASSEMBLY", DESMONTAJE: "DISASSEMBLY",
};

export function normalizeRut(value: string): string { return value.toUpperCase().replace(/[^0-9K]/g, ""); }

export function isValidChileanRut(value: string): boolean {
  const rut = normalizeRut(value);
  if (!/^\d{7,8}[0-9K]$/.test(rut)) return false;
  const body = rut.slice(0, -1); let sum = 0; let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index--) { sum += Number(body[index]) * multiplier; multiplier = multiplier === 7 ? 2 : multiplier + 1; }
  const result = 11 - (sum % 11); const verifier = result === 11 ? "0" : result === 10 ? "K" : String(result);
  return verifier === rut.at(-1);
}

function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function capabilities(value: unknown): StaffImportCapability[] {
  return text(value).split(/[,;|]/).map((item) => capabilityAliases[item.trim().toUpperCase()]).filter((item): item is StaffImportCapability => Boolean(item));
}
const specializationAliases: Readonly<Record<string, StaffImportSpecialization>> = {
  CLASSIC: "CLASSIC", POLAROID: "POLAROID", "BLACK STUDIO": "BLACK_STUDIO", BLACK_STUDIO: "BLACK_STUDIO", BBOX360: "BBOX360", LIGHTBOX: "LIGHTBOX", BOOMBALL: "BOOMBALL", HASHTAG: "HASHTAG", INSTABOX: "INSTABOX", "VIDEO LOUNGE": "VIDEO_LOUNGE", VIDEO_LOUNGE: "VIDEO_LOUNGE",
};
function specializations(value: unknown): StaffImportSpecialization[] {
  return text(value).split(/[,;|]/).map((item) => specializationAliases[item.trim().toUpperCase()]).filter((item): item is StaffImportSpecialization => Boolean(item));
}

export function validateStaffImportRows(rawRows: readonly Readonly<Record<string, unknown>>[]): StaffImportPreview {
  const issues: StaffImportIssue[] = []; const seen = new Map<string, number>(); const rows: StaffImportRow[] = [];
  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; const firstName = text(raw["First Name"]); const lastName = text(raw["Last Name"]); const rut = normalizeRut(text(raw.RUT));
    const phone = text(raw.Phone); const status = text(raw.Status).toUpperCase() as StaffImportStatus; const role = text(raw["Role Classification"]).toUpperCase() as StaffImportRole;
    const parsedCapabilities = capabilities(raw.Capabilities); const required: Array<[string, string]> = [["First Name", firstName], ["Last Name", lastName], ["RUT", rut], ["Phone", phone], ["Status", status], ["Role Classification", role]];
    required.forEach(([field, value]) => { if (!value) issues.push({ rowNumber, field, message: "Campo obligatorio." }); });
    if (rut && !isValidChileanRut(rut)) issues.push({ rowNumber, field: "RUT", message: "RUT inválido." });
    if (seen.has(rut)) issues.push({ rowNumber, field: "RUT", message: `RUT duplicado con la fila ${seen.get(rut)}.` }); else if (rut) seen.set(rut, rowNumber);
    if (!(["ACTIVE", "VACATION", "MEDICAL_LEAVE", "INACTIVE"] as string[]).includes(status)) issues.push({ rowNumber, field: "Status", message: "Debe ser ACTIVE, VACATION, MEDICAL_LEAVE o INACTIVE." });
    if (!(["CALYPSO", "GREEN"] as string[]).includes(role)) issues.push({ rowNumber, field: "Role Classification", message: "Debe ser CALYPSO o GREEN." });
    const resolvedCapabilities = parsedCapabilities.length ? parsedCapabilities : CAPABILITIES[role] ?? [];
    rows.push({ rowNumber, employeeCode: text(raw["Employee Code"]) || undefined, firstName, lastName, rut, phone, email: text(raw.Email) || undefined, status, roleClassification: role, capabilities: resolvedCapabilities, specializations: specializations(raw.Specializations), notes: text(raw.Notes) || undefined, bank: text(raw.Bank) || undefined, accountNumber: text(raw["Account Number"]) || undefined, emergencyContact: text(raw["Emergency Contact"]) || undefined });
  });
  if (!rows.length) issues.push({ rowNumber: 1, field: "Archivo", message: "El archivo no contiene personas para importar." });
  return { rows, issues, valid: issues.length === 0 };
}

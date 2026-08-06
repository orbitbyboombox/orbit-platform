import { readSheet } from "read-excel-file/browser";
import { STAFF_IMPORT_HEADERS, type StaffImportPreview } from "./types";
import { validateStaffImportRows } from "./staff-import.validator";

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row); return rows;
}

function records(matrix: readonly (readonly unknown[])[]): Readonly<Record<string, unknown>>[] {
  if (!matrix.length) return [];
  const headers = matrix[0].map((value) => String(value ?? "").trim());
  const missing = STAFF_IMPORT_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Faltan columnas obligatorias de plantilla: ${missing.join(", ")}.`);
  return matrix.slice(1).filter((row) => row.some((value) => String(value ?? "").trim())).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export async function parseStaffImportFile(file: File): Promise<StaffImportPreview> {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "csv") return validateStaffImportRows(records(parseCsv(await file.text())));
  if (extension === "xlsx") return validateStaffImportRows(records(await readSheet(file, "Importación Staff")));
  throw new Error("Formato no compatible. Usa la plantilla Excel (.xlsx) o CSV (.csv).");
}

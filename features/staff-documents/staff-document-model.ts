export const staffDocumentCategories = [
  "IDENTIDAD",
  "CONTRATOS",
  "BOLETAS",
  "GASTOS",
  "LIQUIDACIONES",
  "OTROS",
] as const;

export type StaffDocumentCategory = (typeof staffDocumentCategories)[number];

export type StaffDocumentView = {
  id: string;
  category: StaffDocumentCategory;
  documentType: string;
  fileName: string;
  label: string;
  createdAt: string;
  applicableMonth: string | null;
  status: string;
  source: "STAFF_DOCUMENT" | "EXPENSE_REFERENCE";
};

export const staffDocumentCategoryMeta: ReadonlyArray<{
  category: StaffDocumentCategory;
  folder: string;
  label: string;
  periodic: boolean;
}> = [
  { category: "IDENTIDAD", folder: "01_IDENTIDAD", label: "Identidad", periodic: false },
  { category: "CONTRATOS", folder: "02_CONTRATOS", label: "Contratos", periodic: false },
  { category: "BOLETAS", folder: "03_BOLETAS", label: "Boletas", periodic: true },
  { category: "GASTOS", folder: "04_GASTOS", label: "Gastos", periodic: true },
  { category: "LIQUIDACIONES", folder: "05_LIQUIDACIONES", label: "Liquidaciones", periodic: true },
  { category: "OTROS", folder: "06_OTROS", label: "Otros", periodic: false },
];

export function isStaffDocumentCategory(value: string): value is StaffDocumentCategory {
  return staffDocumentCategories.includes(value as StaffDocumentCategory);
}

export function isCanonicalMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function safeStaffDocumentFileName(fileName: string) {
  const pieces = fileName.trim().split(".");
  const extension = pieces.length > 1 ? pieces.pop()?.toLowerCase() ?? "" : "";
  const base = pieces.join(".") || "documento";
  const safeBase = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "documento";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "").slice(0, 10);
  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
}

export function staffDocumentStoragePath(input: {
  staffId: string;
  category: StaffDocumentCategory;
  applicableMonth?: string | null;
  documentId: string;
  fileName: string;
}) {
  const meta = staffDocumentCategoryMeta.find((item) => item.category === input.category);
  if (!meta) throw new Error("Categoría documental inválida.");
  if (meta.periodic && !isCanonicalMonth(input.applicableMonth ?? ""))
    throw new Error("Selecciona el mes aplicable del documento.");
  const month = meta.periodic ? `/${input.applicableMonth}` : "";
  return `staff/${input.staffId}/${meta.folder}${month}/${input.documentId}-${safeStaffDocumentFileName(input.fileName)}`;
}

export function staffDocumentType(category: StaffDocumentCategory) {
  return {
    IDENTIDAD: "STAFF_IDENTITY_OTHER",
    CONTRATOS: "STAFF_CONTRACT",
    BOLETAS: "STAFF_RECEIPT",
    GASTOS: "STAFF_EXPENSE_DOCUMENT",
    LIQUIDACIONES: "STAFF_SETTLEMENT_DOCUMENT",
    OTROS: "STAFF_OTHER_DOCUMENT",
  }[category];
}

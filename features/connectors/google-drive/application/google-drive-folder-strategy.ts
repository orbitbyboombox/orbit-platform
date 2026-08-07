import type { GoogleDriveDestination, GoogleDriveDestinationRequest, GoogleDriveFolderPlanItem } from "../types/google-drive-live.types";

export const DEFAULT_GOOGLE_DRIVE_ROOT = "ORBIT";
export const GOOGLE_DRIVE_ROOT_FOLDERS = ["CLIENTES", "CONTABILIDAD", "STAFF", "OPERACIONES", "ACTIVOS", "DOCUMENTACIÓN", "REPORTES", "SISTEMA"] as const;
export const CUSTOMER_FOLDERS = ["01 Contrato", "02 Cotizaciones", "03 Comprobantes", "04 Diseños", "05 Fotografías", "06 Entrega", "07 Historial"] as const;

const MONTHS = ["01 Enero", "02 Febrero", "03 Marzo", "04 Abril", "05 Mayo", "06 Junio", "07 Julio", "08 Agosto", "09 Septiembre", "10 Octubre", "11 Noviembre", "12 Diciembre"] as const;

function folder(name: string, parentPath: string | null): GoogleDriveFolderPlanItem {
  return { name, parentPath, path: parentPath ? `${parentPath}/${name}` : name };
}

function cleanName(value: string) { return value.trim().replace(/[\\/]+/g, "-"); }
function dateParts(value: string, label: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} debe usar el formato YYYY-MM-DD.`);
  return { year: match[1], month: MONTHS[Number(match[2]) - 1] };
}

export function buildRootFolderPlan(rootName=DEFAULT_GOOGLE_DRIVE_ROOT): readonly GoogleDriveFolderPlanItem[] {
  const root = folder(rootName, null);
  const topLevel = GOOGLE_DRIVE_ROOT_FOLDERS.map((name) => folder(name, root.path));
  const staticChildren: Record<string, readonly string[]> = {
    OPERACIONES: ["Montajes", "Desmontajes", "Fotografías", "Checklists", "Incidencias", "Rutas"],
    ACTIVOS: ["Vehículos", "Black Boxes", "Booths", "Maintenance"],
    DOCUMENTACIÓN: ["Templates", "Manuals", "Catalogues", "Branding"],
    REPORTES: ["Operational Reports", "Financial Reports", "Business Reports"],
  };
  return [root, ...topLevel, ...topLevel.flatMap((parent) => (staticChildren[parent.name] ?? []).map((name) => folder(name, parent.path)))];
}

export function buildCustomerFolderPlan(customerName: string, eventDate: string,rootName=DEFAULT_GOOGLE_DRIVE_ROOT): readonly GoogleDriveFolderPlanItem[] {
  const { year } = dateParts(eventDate, "La fecha del evento");
  const clients = `${rootName}/CLIENTES`;
  const yearFolder = folder(year, clients);
  const customerFolder = folder(`${cleanName(customerName)} - ${eventDate}`, yearFolder.path);
  return [yearFolder, customerFolder, ...CUSTOMER_FOLDERS.map((name) => folder(name, customerFolder.path))];
}

export function buildAccountingFolderPlan(documentDate: string, category: string,rootName=DEFAULT_GOOGLE_DRIVE_ROOT): readonly GoogleDriveFolderPlanItem[] {
  const { year, month } = dateParts(documentDate, "La fecha del documento");
  const accounting = `${rootName}/CONTABILIDAD`;
  const yearFolder = folder(year, accounting);
  const monthFolder = folder(month, yearFolder.path);
  return [yearFolder, monthFolder, folder(category, monthFolder.path)];
}

export function buildStaffFolderPlan(staffMemberName: string,rootName=DEFAULT_GOOGLE_DRIVE_ROOT): readonly GoogleDriveFolderPlanItem[] {
  const staffRoot = `${rootName}/STAFF`;
  const staffMember = folder(cleanName(staffMemberName), staffRoot);
  return [staffMember, ...["01 Documentos", "02 Capacitaciones", "03 Licencias", "04 Evaluaciones", "05 Historial"].map((name) => folder(name, staffMember.path))];
}

export function resolveAutomaticDestination(request: GoogleDriveDestinationRequest,rootName=DEFAULT_GOOGLE_DRIVE_ROOT): GoogleDriveDestination {
  const { kind, context } = request;
  const customerMap = { CONTRACT: "01 Contrato", QUOTATION: "02 Cotizaciones", PAYMENT_PROOF: "03 Comprobantes", DESIGN: "04 Diseños", PHOTO: "05 Fotografías", DELIVERY: "06 Entrega", CUSTOMER_HISTORY: "07 Historial" } as const;
  if (kind in customerMap) {
    if (!context.customerName || !context.eventDate) throw new Error("El destino del cliente requiere nombre y fecha del evento.");
    const plan = buildCustomerFolderPlan(context.customerName, context.eventDate,rootName);
    return { kind, folderPath: `${plan[1].path}/${customerMap[kind as keyof typeof customerMap]}` };
  }
  const accountingMap = { ACCOUNTING_FUEL: "Combustible", ACCOUNTING_PURCHASE: "Compras", ACCOUNTING_MAINTENANCE: "Mantenciones", ACCOUNTING_INVOICE: "Facturas", ACCOUNTING_RECEIPT: "Boletas" } as const;
  if (kind in accountingMap) {
    if (!context.documentDate) throw new Error("El destino contable requiere la fecha del documento.");
    const plan = buildAccountingFolderPlan(context.documentDate, accountingMap[kind as keyof typeof accountingMap],rootName);
    return { kind, folderPath: plan[plan.length - 1].path };
  }
  const operatorMap = { OPERATOR_DOCUMENT: "01 Documentos", OPERATOR_TRAINING: "02 Capacitaciones", OPERATOR_LICENSE: "03 Licencias", OPERATOR_HISTORY: "05 Historial" } as const;
  if (kind in operatorMap) {
    if (!context.staffMemberName) throw new Error("El destino del operador requiere el nombre del colaborador.");
    return { kind, folderPath: `${rootName}/STAFF/${cleanName(context.staffMemberName)}/${operatorMap[kind as keyof typeof operatorMap]}` };
  }
  const fixed: Record<string, string> = {
    OPERATION_MOUNTING: "OPERACIONES/Montajes", OPERATION_DISMANTLING: "OPERACIONES/Desmontajes", OPERATION_PHOTO: "OPERACIONES/Fotografías", OPERATION_CHECKLIST: "OPERACIONES/Checklists", OPERATION_INCIDENT: "OPERACIONES/Incidencias", OPERATION_ROUTE: "OPERACIONES/Rutas",
    ASSET_VEHICLE: "ACTIVOS/Vehículos", ASSET_BLACK_BOX: "ACTIVOS/Black Boxes", ASSET_BOOTH: "ACTIVOS/Booths", ASSET_MAINTENANCE: "ACTIVOS/Maintenance",
    DOCUMENT_TEMPLATE: "DOCUMENTACIÓN/Templates", DOCUMENT_MANUAL: "DOCUMENTACIÓN/Manuals", DOCUMENT_CATALOGUE: "DOCUMENTACIÓN/Catalogues", DOCUMENT_BRANDING: "DOCUMENTACIÓN/Branding",
    REPORT_OPERATIONAL: "REPORTES/Operational Reports", REPORT_FINANCIAL: "REPORTES/Financial Reports", REPORT_BUSINESS: "REPORTES/Business Reports", SYSTEM_FILE: "SISTEMA",
  };
  return { kind, folderPath: `${rootName}/${fixed[kind]}` };
}

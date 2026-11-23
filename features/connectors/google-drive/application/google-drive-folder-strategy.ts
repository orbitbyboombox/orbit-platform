import type { GoogleDriveDestination, GoogleDriveDestinationRequest, GoogleDriveFolderPlanItem } from "../types/google-drive-live.types";

export const DEFAULT_GOOGLE_DRIVE_ROOT = "ORBIT";
export const GOOGLE_DRIVE_ROOT_FOLDERS = ["01_CLIENTES", "02_STAFF", "03_CONTABILIDAD", "04_OPERACIONES", "05_ACTIVOS_Y_RECURSOS", "06_DOCUMENTACION_EMPRESA", "REPORTES", "SISTEMA"] as const;
export const CUSTOMER_FOLDERS = ["01_Contrato", "02_Comprobantes", "03_Cotizaciones", "04_Diseños", "05_Fotografías", "06_Videos", "07_Facturación", "08_Honorarios", "09_Documentos"] as const;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const SPANISH_MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"] as const;

function folder(name: string, parentPath: string | null): GoogleDriveFolderPlanItem {
  return { name, parentPath, path: parentPath ? `${parentPath}/${name}` : name };
}

function cleanName(value: string) { return value.trim().replace(/[\\/]+/g, "-"); }
function dateParts(value: string, label: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} debe usar el formato YYYY-MM-DD.`);
  return { year: match[1], month: MONTHS[Number(match[2]) - 1], displayDate: `${match[3]}-${match[2]}-${match[1]}` };
}

export function buildRootFolderPlan(rootName=DEFAULT_GOOGLE_DRIVE_ROOT): readonly GoogleDriveFolderPlanItem[] {
  const root = folder(rootName, null);
  const topLevel = GOOGLE_DRIVE_ROOT_FOLDERS.map((name) => folder(name, root.path));
  const staticChildren: Record<string, readonly string[]> = {
    "04_OPERACIONES": ["Montajes", "Desmontajes", "Fotografías", "Checklists", "Incidencias", "Rutas"],
    "05_ACTIVOS_Y_RECURSOS": ["Vehículos", "Black Boxes", "Booths", "Maintenance"],
    "06_DOCUMENTACION_EMPRESA": ["Templates", "Manuals", "Catalogues", "Branding"],
    REPORTES: ["Operational Reports", "Financial Reports", "Business Reports"],
  };
  return [root, ...topLevel, ...topLevel.flatMap((parent) => (staticChildren[parent.name] ?? []).map((name) => folder(name, parent.path)))];
}

export function buildCustomerFolderPlan(customerName: string, eventDate: string,rootName=DEFAULT_GOOGLE_DRIVE_ROOT): readonly GoogleDriveFolderPlanItem[] {
  const { year, displayDate } = dateParts(eventDate, "La fecha del evento");
  const monthNumber = Number(eventDate.slice(5, 7));
  const yearFolder = folder(year, `${rootName}/01_CLIENTES`);
  const monthFolder = folder(`${eventDate.slice(5, 7)} ${SPANISH_MONTHS[monthNumber - 1].toLocaleUpperCase("es-CL")}`, yearFolder.path);
  const customerFolder = folder(`${displayDate} - ${cleanName(customerName)}`, monthFolder.path);
  return [yearFolder, monthFolder, customerFolder, ...CUSTOMER_FOLDERS.map((name) => folder(name, customerFolder.path))];
}

export function buildCancelledReservationFolderPlan(eventDate:string,rootName=DEFAULT_GOOGLE_DRIVE_ROOT):readonly GoogleDriveFolderPlanItem[]{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);if(!match)throw new Error("La fecha del evento debe usar el formato YYYY-MM-DD.");
  const archive=folder("Reservas Canceladas",rootName);const year=folder(match[1],archive.path);const month=folder(SPANISH_MONTHS[Number(match[2])-1],year.path);return[archive,year,month];
}

export function buildAccountingFolderPlan(documentDate: string, category: string,rootName=DEFAULT_GOOGLE_DRIVE_ROOT): readonly GoogleDriveFolderPlanItem[] {
  const { year, month } = dateParts(documentDate, "La fecha del documento");
  const accounting = `${rootName}/03_CONTABILIDAD`;
  const yearFolder = folder(year, accounting);
  const monthFolder = folder(month, yearFolder.path);
  return [yearFolder, monthFolder, folder(category, monthFolder.path)];
}

export function buildStaffFolderPlan(staffMemberName: string,rootName=DEFAULT_GOOGLE_DRIVE_ROOT): readonly GoogleDriveFolderPlanItem[] {
  const staffRoot = `${rootName}/02_STAFF`;
  const staffMember = folder(cleanName(staffMemberName), staffRoot);
  return [staffMember, ...["01 Documentos", "02 Capacitaciones", "03 Licencias", "04 Evaluaciones", "05 Historial"].map((name) => folder(name, staffMember.path))];
}

export function resolveAutomaticDestination(request: GoogleDriveDestinationRequest,rootName=DEFAULT_GOOGLE_DRIVE_ROOT): GoogleDriveDestination {
  const { kind, context } = request;
  const customerMap = { CONTRACT: "01_Contrato", PAYMENT_PROOF: "02_Comprobantes", QUOTATION: "03_Cotizaciones", DESIGN: "04_Diseños", PHOTO: "05_Fotografías", VIDEO: "06_Videos", INVOICE: "07_Facturación", HONORARIOS: "08_Honorarios", PURCHASE_ORDER: "09_Documentos", OTHER_DOCUMENT: "09_Documentos", DELIVERY: "09_Documentos", CUSTOMER_HISTORY: "09_Documentos" } as const;
  if (kind in customerMap) {
    if (!context.customerName || !context.eventDate) throw new Error("El destino del cliente requiere nombre y fecha del evento.");
    const plan = buildCustomerFolderPlan(context.customerName, context.eventDate,rootName);
    return { kind, folderPath: `${plan[2].path}/${customerMap[kind as keyof typeof customerMap]}` };
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
    return { kind, folderPath: `${rootName}/02_STAFF/${cleanName(context.staffMemberName)}/${operatorMap[kind as keyof typeof operatorMap]}` };
  }
  const fixed: Record<string, string> = {
    OPERATION_MOUNTING: "04_OPERACIONES/Montajes", OPERATION_DISMANTLING: "04_OPERACIONES/Desmontajes", OPERATION_PHOTO: "04_OPERACIONES/Fotografías", OPERATION_CHECKLIST: "04_OPERACIONES/Checklists", OPERATION_INCIDENT: "04_OPERACIONES/Incidencias", OPERATION_ROUTE: "04_OPERACIONES/Rutas",
    ASSET_VEHICLE: "05_ACTIVOS_Y_RECURSOS/Vehículos", ASSET_BLACK_BOX: "05_ACTIVOS_Y_RECURSOS/Black Boxes", ASSET_BOOTH: "05_ACTIVOS_Y_RECURSOS/Booths", ASSET_MAINTENANCE: "05_ACTIVOS_Y_RECURSOS/Maintenance",
    DOCUMENT_TEMPLATE: "06_DOCUMENTACION_EMPRESA/Templates", DOCUMENT_MANUAL: "06_DOCUMENTACION_EMPRESA/Manuals", DOCUMENT_CATALOGUE: "06_DOCUMENTACION_EMPRESA/Catalogues", DOCUMENT_BRANDING: "06_DOCUMENTACION_EMPRESA/Branding",
    REPORT_OPERATIONAL: "REPORTES/Operational Reports", REPORT_FINANCIAL: "REPORTES/Financial Reports", REPORT_BUSINESS: "REPORTES/Business Reports", SYSTEM_FILE: "SISTEMA",
  };
  return { kind, folderPath: `${rootName}/${fixed[kind]}` };
}

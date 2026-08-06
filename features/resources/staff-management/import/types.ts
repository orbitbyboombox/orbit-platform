export const STAFF_IMPORT_HEADERS = [
  "Employee Code", "First Name", "Last Name", "RUT", "Phone", "Email", "Status",
  "Role Classification", "Capabilities", "Notes", "Bank", "Account Number", "Emergency Contact",
] as const;

export type StaffImportHeader = typeof STAFF_IMPORT_HEADERS[number];
export type StaffImportStatus = "ACTIVE" | "INACTIVE";
export type StaffImportRole = "CALYPSO" | "GREEN";
export type StaffImportCapability = "ASSEMBLY" | "OPERATOR" | "DISASSEMBLY";

export interface StaffImportRow {
  readonly rowNumber: number;
  readonly employeeCode?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly rut: string;
  readonly phone: string;
  readonly email?: string;
  readonly status: StaffImportStatus;
  readonly roleClassification: StaffImportRole;
  readonly capabilities: readonly StaffImportCapability[];
  readonly notes?: string;
  readonly bank?: string;
  readonly accountNumber?: string;
  readonly emergencyContact?: string;
}

export interface StaffImportIssue { readonly rowNumber: number; readonly field: string; readonly message: string; }
export interface StaffImportPreview { readonly rows: readonly StaffImportRow[]; readonly issues: readonly StaffImportIssue[]; readonly valid: boolean; }

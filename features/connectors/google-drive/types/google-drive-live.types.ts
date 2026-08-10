export type GoogleDriveFolderStatus = "PENDING" | "CREATED" | "UPDATED" | "ERROR";

export type GoogleDriveDocumentKind =
  | "CONTRACT" | "QUOTATION" | "PAYMENT_PROOF" | "DESIGN" | "PHOTO" | "VIDEO" | "INVOICE" | "HONORARIOS" | "OTHER_DOCUMENT" | "DELIVERY" | "CUSTOMER_HISTORY"
  | "ACCOUNTING_FUEL" | "ACCOUNTING_PURCHASE" | "ACCOUNTING_MAINTENANCE" | "ACCOUNTING_INVOICE" | "ACCOUNTING_RECEIPT"
  | "OPERATOR_DOCUMENT" | "OPERATOR_TRAINING" | "OPERATOR_LICENSE" | "OPERATOR_HISTORY"
  | "OPERATION_MOUNTING" | "OPERATION_DISMANTLING" | "OPERATION_PHOTO" | "OPERATION_CHECKLIST" | "OPERATION_INCIDENT" | "OPERATION_ROUTE"
  | "ASSET_VEHICLE" | "ASSET_BLACK_BOX" | "ASSET_BOOTH" | "ASSET_MAINTENANCE"
  | "DOCUMENT_TEMPLATE" | "DOCUMENT_MANUAL" | "DOCUMENT_CATALOGUE" | "DOCUMENT_BRANDING"
  | "REPORT_OPERATIONAL" | "REPORT_FINANCIAL" | "REPORT_BUSINESS" | "SYSTEM_FILE";

export interface GoogleDriveFolderPlanItem {
  name: string;
  path: string;
  parentPath: string | null;
}

export interface GoogleDriveFolderRecord extends GoogleDriveFolderPlanItem {
  driveFolderId?: string;
  status: GoogleDriveFolderStatus;
  lastUpdatedAt?: string;
  errorMessage?: string;
}

export interface GoogleDriveDestinationContext {
  customerName?: string;
  eventDate?: string;
  staffMemberName?: string;
  documentDate?: string;
}

export interface GoogleDriveDestinationRequest {
  kind: GoogleDriveDocumentKind;
  context: GoogleDriveDestinationContext;
}

export interface GoogleDriveDestination {
  kind: GoogleDriveDocumentKind;
  folderPath: string;
}

export type GoogleDriveErrorCode = "WORKSPACE_UNAVAILABLE" | "DRIVE_SCOPE_MISSING" | "INVALID_CONTEXT" | "PROVIDER_ERROR";

export interface GoogleDriveError {
  code: GoogleDriveErrorCode;
  message: string;
  retryable: boolean;
}

export type GoogleDriveFolderSyncResult =
  | { ok: true; folders: readonly GoogleDriveFolderRecord[] }
  | { ok: false; folders: readonly GoogleDriveFolderRecord[]; error: GoogleDriveError };

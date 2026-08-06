export type MasterDataDomain = "SERVICES" | "OFFICIAL_PRICING" | "EVENT_TYPES" | "EXTRAS" | "TRANSPORT" | "STAFF" | "EQUIPMENT" | "PAYROLL" | "COMPANY" | "DOCUMENT_TEMPLATES" | "GOOGLE_WORKSPACE" | "SYSTEM_PARAMETERS";

export interface MasterDataRecord {
  readonly id: string;
  readonly domain: MasterDataDomain;
  readonly code: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly displayOrder: number;
  readonly version: number;
  readonly price?: number | null;
  readonly durationHours?: number | null;
  readonly description?: string;
  readonly configuration?: string;
  readonly detail: string;
}

export interface MasterDataProjection {
  readonly canEdit: boolean;
  readonly role: string;
  readonly records: readonly MasterDataRecord[];
  readonly staffCount: number;
  readonly equipmentCount: number;
}

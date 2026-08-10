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
  readonly services: readonly ServiceAdministrationRecord[];
}

export type ServiceExtraCode = "QR" | "UNLIMITED_MAGNETS" | "SCRAPBOOK" | "BRANDING" | "TRANSPORT" | "ADDITIONAL_HOURS";

export interface ServiceAdministrationRecord {
  readonly id: string;
  readonly priceId: string | null;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly basePrice: number | null;
  readonly minimumHours: number;
  readonly maximumHours: number;
  readonly additionalHourPrice: number | null;
  readonly enabled: boolean;
  readonly displayOrder: number;
  readonly description: string;
  readonly compatibleExtras: readonly ServiceExtraCode[];
  readonly defaultExtras: readonly ServiceExtraCode[];
  readonly behavior: string;
  readonly version: number;
  readonly priceVersion: number | null;
}

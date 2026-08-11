export type MasterDataDomain = "SERVICES" | "EVENT_VENUES" | "OFFICIAL_PRICING" | "EVENT_TYPES" | "EXTRAS" | "TRANSPORT" | "COSTS" | "STAFF" | "EQUIPMENT" | "PAYROLL" | "COMPANY" | "DOCUMENT_TEMPLATES" | "GOOGLE_WORKSPACE" | "SYSTEM_PARAMETERS";

export type CostMasterCategory = "PAPER" | "PHOTO_PRODUCTION" | "OPERATOR" | "ASSEMBLY" | "FUEL" | "TRANSPORT_OVERRIDE" | "OTHER";

export interface CostMasterRecord {
  readonly id: string;
  readonly category: CostMasterCategory;
  readonly code: string;
  readonly label: string;
  readonly amount: number | null;
  readonly quantity: number | null;
  readonly unit: string;
  readonly enabled: boolean;
  readonly displayOrder: number;
  readonly version: number;
  readonly updatedAt: string;
}

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
  readonly venues: VenueAdministrationProjection;
  readonly transportZones: readonly TransportZoneAdministrationRecord[];
  readonly costMaster: readonly CostMasterRecord[];
}

export interface TransportZoneAdministrationRecord {
  readonly id: string;
  readonly code: string;
  readonly province: string;
  readonly transportValue: number | null;
  readonly enabled: boolean;
  readonly displayOrder: number;
  readonly municipalities: readonly string[];
  readonly version: number;
}

export interface VenueAdministrationRecord {
  readonly code: string;
  readonly name: string;
  readonly municipality: string;
  readonly province: string;
  readonly surcharge: number;
  readonly notes: string;
  readonly enabled: boolean;
  readonly displayOrder: number;
}

export interface VenueAdministrationProjection {
  readonly masterId: string | null;
  readonly version: number | null;
  readonly records: readonly VenueAdministrationRecord[];
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
  readonly estimatedPhotosPerHour: number | null;
  readonly paperConsumption: number | null;
  readonly enabled: boolean;
  readonly displayOrder: number;
  readonly description: string;
  readonly compatibleExtras: readonly ServiceExtraCode[];
  readonly defaultExtras: readonly ServiceExtraCode[];
  readonly behavior: string;
  readonly version: number;
  readonly priceVersion: number | null;
}

export type AssetType = "TOTEM" | "CASE" | "VEHICLE" | "CLASSIC_TOTEM" | "BLACK_STUDIO" | "BBOX360" | "LIGHTBOX" | "BOOMBALL" | "PRINTER" | "CAMERA" | "LIGHT" | "ACCESSORY";
export type AssetStatus = "AVAILABLE" | "ASSIGNED" | "IN_EVENT" | "MAINTENANCE" | "OUT_OF_SERVICE";
export interface OperationalAsset { readonly id: string; readonly assetCode: string; readonly assetType: AssetType; readonly status: AssetStatus; readonly usageCounter: number; readonly qrKey: string; }
export interface AssignAssetInput { readonly projectId: string; readonly assetId: string; readonly orbitEventId: string; readonly reason: string; }
export interface AssetAssignmentView { readonly assignmentId: string; readonly projectId: string; readonly assetId: string; readonly assetCode: string; readonly assetType: AssetType; readonly projectName: string; readonly eventDate: string; readonly eventTime: string; readonly operator?: string; }

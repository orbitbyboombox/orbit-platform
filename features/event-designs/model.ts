export const EVENT_DESIGN_TYPE = "DESIGN" as const;

export type EventDesignDocument = {
  id: string;
  version: number;
  isCurrent: boolean;
  status: "RECEIVED" | "APPROVED";
  originalFilename: string;
  createdAt: string;
  uploadedBy: string;
  approvedAt?: string;
  driveStatus: "PENDING" | "SYNCED" | "ERROR";
  driveError?: string;
  href: string;
};

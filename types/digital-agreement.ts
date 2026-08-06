import type { ApprovalMetadata, AuditMetadata } from "./audit";

export type DigitalAgreementState = "DRAFT" | "ACCEPTED" | "SIGNED" | "PDF_PREPARED" | "STORED" | "SENT" | "TIMELINE_RECORDED" | "FAILED";

export interface SignatureEvidence {
  id: string;
  agreementId: string;
  signerId: string;
  signedAt: string;
  consentTextVersion: string;
  signatureContentHash: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface SignedAgreementRecord extends AuditMetadata {
  id: string;
  customerId: string;
  projectId: string;
  state: DigitalAgreementState;
  signature?: SignatureEvidence;
  signedPdfReference?: string;
  driveReference?: string;
  gmailCommunicationId?: string;
  timelineEventId?: string;
  approval?: ApprovalMetadata;
  failureReason?: string;
}

export interface DigitalAgreementWorkflow {
  prepareSignedDocument(record: SignedAgreementRecord): Promise<SignedAgreementRecord>;
}

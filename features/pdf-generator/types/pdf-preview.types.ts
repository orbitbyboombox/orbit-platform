import type { ContractDocument } from "@/features/contract-engine";

export interface ContractPdfProject {
  name: string;
  services: readonly string[];
  duration?: string;
  extras: readonly string[];
}

export interface ContractPdfGeneratorInput {
  contract: ContractDocument;
  project: ContractPdfProject;
  customerSignature?: ContractPdfSignatureInput;
}

export interface ContractPdfSignatureInput {
  evidenceId: string;
  signedAt: string;
  imageDataUrl: string;
}

export interface PdfTextField {
  label: string;
  value: string;
}

export interface PdfMoneyField {
  label: string;
  amount: number;
  currency: "CLP";
}

export interface ContractPdfPreviewModel {
  metadata: {
    title: string;
    subject: string;
    language: string;
    contractId: string;
    projectId: string;
  };
  branding: {
    applicationName: string;
    logoPath: string;
    developedBy: string;
    poweredBy: string;
  };
  heading: {
    title: string;
    contractType: string;
    issuedOn: string;
  };
  customer: readonly PdfTextField[];
  event: readonly PdfTextField[];
  services: {
    selected: readonly string[];
    duration: string | null;
    extras: readonly string[];
    transport: string;
  };
  commercialSummary: readonly PdfMoneyField[];
  clauses: ContractDocument["clauses"];
  signatures: readonly [
    { role: "CUSTOMER"; label: string; signerName: string; embedded: boolean; evidenceId?: string; signedAt?: string; imageDataUrl?: string },
    { role: "BOOMBOX"; label: string; signerName: string; embedded: false },
  ];
}

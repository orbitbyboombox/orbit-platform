export const titles: Readonly<Record<number, string>>;
export function money(amount: number | string): string;
export function issueDay(doc: { issueDate?: string; created_at?: string }): string;
export function renderTaxPdf(
  doc: {
    folio: string | number;
    issueDate?: string;
    created_at?: string;
    copy?: string;
    snapshot: {
      type: number;
      client: string;
      rut: string;
      lines: Array<{ name: string; net: number; quantity?: number; unitPrice?: number }>;
      net: number;
      tax: number;
      total: number;
      [key: string]: unknown;
    };
  },
  options?: {
    issuer?: Record<string, string>;
    logos?: Record<string, string>;
    syntheticStamp?: string;
  },
): Promise<Uint8Array>;

import type { ExpenseOcrProvider, OcrExpenseExtraction } from "../types/expense-capture.types";

const MOCK_FUEL_EXTRACTION: OcrExpenseExtraction = {
  documentType: "FUEL_RECEIPT",
  date: "05 agosto 2026 · 11:42",
  supplier: "Copec Chicureo",
  documentNumber: "B-00845129",
  total: 62000,
  vat: 9899,
  products: [{ name: "Gasolina 93", quantity: 48.4, total: 62000 }],
  confidence: 0.98,
};

export class MockExpenseOcrProvider implements ExpenseOcrProvider {
  extract(photoName: string): OcrExpenseExtraction {
    void photoName;
    return MOCK_FUEL_EXTRACTION;
  }
}

export const MOCK_EXPENSE_OCR_PROVIDER = new MockExpenseOcrProvider();

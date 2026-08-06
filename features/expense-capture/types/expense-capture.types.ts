export type ExpenseDocumentType = "FUEL_RECEIPT" | "PURCHASE_RECEIPT" | "INVOICE" | "SUPPLY_PURCHASE" | "MAINTENANCE_INVOICE" | "OTHER";

export type ExpenseCategory = "FUEL" | "SUPPLIES" | "MAINTENANCE" | "TRANSPORT" | "OTHER";

export interface OcrExtractedProduct {
  name: string;
  quantity: number;
  total: number;
  recognizedSupplyId?: string;
}

export interface OcrExpenseExtraction {
  documentType: ExpenseDocumentType;
  date: string;
  supplier: string;
  documentNumber: string;
  total: number;
  vat: number;
  products: readonly OcrExtractedProduct[];
  confidence: number;
}

export interface ExpenseClassificationSuggestion {
  category: ExpenseCategory;
  confidence: number;
  reason: string;
  requiresConfirmation: true;
  requiresVehicle: boolean;
}

export interface CapturedExpense {
  id: string;
  originalPhotoName: string;
  supplier: string;
  category: ExpenseCategory;
  date: string;
  documentNumber: string;
  total: number;
  vat: number;
  vehicle?: string;
  event?: string;
  detectedProducts: readonly OcrExtractedProduct[];
  inventoryUpdateSuggested: boolean;
  profitRegistrationPrepared: boolean;
}

export interface ExpenseOcrProvider {
  extract(photoName: string): OcrExpenseExtraction;
}

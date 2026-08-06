import type {
  CapturedExpense,
  ExpenseCategory,
  ExpenseClassificationSuggestion,
  OcrExpenseExtraction,
} from "../types/expense-capture.types";

export function suggestExpenseClassification(extraction: OcrExpenseExtraction): ExpenseClassificationSuggestion {
  const supplier = extraction.supplier.toLocaleLowerCase("es-CL");
  const recognizedSupply = extraction.products.some(({ recognizedSupplyId }) => Boolean(recognizedSupplyId));

  if (extraction.documentType === "FUEL_RECEIPT" || supplier.includes("copec")) {
    return { category: "FUEL", confidence: 0.98, reason: "Proveedor y producto asociados a combustible.", requiresConfirmation: true, requiresVehicle: true };
  }
  if (extraction.documentType === "MAINTENANCE_INVOICE") {
    return { category: "MAINTENANCE", confidence: 0.96, reason: "Documento identificado como mantenimiento.", requiresConfirmation: true, requiresVehicle: true };
  }
  if (recognizedSupply) {
    return { category: "SUPPLIES", confidence: 0.94, reason: "Productos reconocidos por el Motor de Insumos.", requiresConfirmation: true, requiresVehicle: false };
  }
  return { category: "OTHER", confidence: 0.7, reason: "ORBIT necesita confirmación para completar la categoría.", requiresConfirmation: true, requiresVehicle: false };
}

export interface ConfirmExpenseInput {
  photoName: string;
  extraction: OcrExpenseExtraction;
  category: ExpenseCategory;
  vehicle?: string;
  event?: string;
}

export function confirmCapturedExpense(input: ConfirmExpenseInput): CapturedExpense {
  return {
    id: `expense-${input.extraction.documentNumber}`,
    originalPhotoName: input.photoName,
    supplier: input.extraction.supplier,
    category: input.category,
    date: input.extraction.date,
    documentNumber: input.extraction.documentNumber,
    total: input.extraction.total,
    vat: input.extraction.vat,
    vehicle: input.vehicle,
    event: input.event,
    detectedProducts: input.extraction.products,
    inventoryUpdateSuggested: input.extraction.products.some(({ recognizedSupplyId }) => Boolean(recognizedSupplyId)),
    profitRegistrationPrepared: true,
  };
}

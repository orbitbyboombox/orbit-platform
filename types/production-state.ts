export type ProductionDataState = "REAL" | "ESTIMATED" | "PREPARED" | "PENDING" | "MOCK" | "DEMO";

export interface ProductionStateDescriptor {
  state: ProductionDataState;
  source?: string;
  verifiedAt?: string;
  description?: string;
}

export const PRODUCTION_STATE_LABELS: Readonly<Record<ProductionDataState, string>> = {
  REAL: "Real",
  ESTIMATED: "Estimado",
  PREPARED: "Preparado",
  PENDING: "Pendiente",
  MOCK: "Datos simulados",
  DEMO: "Demostración",
};

export type IntegrationStatus = "PASS" | "PENDIENTE" | "ERROR" | "OFF" | "NO CONFIGURADO";
export interface IntegrationSignal { label: string; status: IntegrationStatus; detail?: string; }
export interface IntegrationHealthSnapshot {
  checkedAt: string;
  accessRole: string;
  summary: readonly IntegrationSignal[];
  whatsapp: readonly IntegrationSignal[];
  boombox: readonly IntegrationSignal[];
  google: readonly IntegrationSignal[];
  orbit: readonly IntegrationSignal[];
}

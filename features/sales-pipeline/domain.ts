import { PIPELINE_STAGES, type FollowUpStatus, type PipelineStage } from "./types.ts";
export type RelatedSalesRow = { status?: string; grand_total?: number; final_customer_price?: number; created_at?: string; occurred_at?: string; direction?: string; channel?: string };
export function normalizeRelatedRows(value: unknown): RelatedSalesRow[] {
  if (Array.isArray(value)) return value.filter((item): item is RelatedSalesRow => Boolean(item && typeof item === "object"));
  if (value && typeof value === "object") return [value as RelatedSalesRow];
  return [];
}
export function derivePipelineStage(input: { explicit?: string | null; commercialStage?: string | null; quotationStatus?: string | null; reservationStatus?: string | null; legacyReservationConfirmed?: boolean }): PipelineStage {
  if (PIPELINE_STAGES.includes(input.explicit as PipelineStage)) return input.explicit as PipelineStage;
  if (["CONFIRMED", "BOOKED"].includes(String(input.reservationStatus).toUpperCase()) || input.legacyReservationConfirmed) return "GANADO";
  const value = String(input.commercialStage ?? "");
  if (value === "Quoting") return "COTIZACIÓN";
  if (["Waiting", "Contacted"].includes(value)) return value === "Waiting" ? "SEGUIMIENTO" : "CALIFICANDO";
  if (["Reserved"].includes(value)) return "RESERVA PENDIENTE";
  if (["Confirmed", "Production", "Finished"].includes(value)) return ["CONFIRMED", "BOOKED"].includes(String(input.reservationStatus).toUpperCase()) || input.legacyReservationConfirmed ? "GANADO" : "RESERVA PENDIENTE";
  if (input.quotationStatus) return "COTIZACIÓN";
  return "NUEVO";
}
export function validateStageTransition(from: PipelineStage, to: PipelineStage, input: { reservationConfirmed: boolean; lostReason?: string | null }) {
  if (to === "GANADO" && !input.reservationConfirmed) return "GANADO requiere una reserva canónica confirmada.";
  if (to === "PERDIDO" && !input.lostReason?.trim()) return "PERDIDO requiere un motivo.";
  if (from === "GANADO" && to !== "GANADO") return "Un Evento ganado no puede retroceder de etapa.";
  return null;
}
export function followUpStatus(input: { stage: PipelineStage; humanHandoff: boolean; optOut: boolean; deliveryEnabled: boolean; nextActionAt: string | null; now?: Date }): FollowUpStatus {
  if (["GANADO", "PERDIDO", "CANCELADO", "PRUEBA", "ARCHIVADO"].includes(input.stage) || input.optOut || input.humanHandoff || input.deliveryEnabled) return "BLOCKED";
  if (!input.nextActionAt) return "PAUSED";
  return new Date(input.nextActionAt).getTime() <= (input.now ?? new Date()).getTime() ? "DUE" : "SCHEDULED";
}
export function actionUrgency(nextActionAt: string | null, now = new Date()): SalesUrgency {
  if (!nextActionAt) return "SIN ACCIÓN";
  const date = new Date(nextActionAt); if (date.getTime() < now.getTime()) return "ATRASADO";
  return date.toDateString() === now.toDateString() ? "HOY" : "PRÓXIMAMENTE";
}
export type SalesUrgency = "HOY" | "ATRASADO" | "PRÓXIMAMENTE" | "SIN ACCIÓN";

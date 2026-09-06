import { PIPELINE_STAGES, type FollowUpStatus, type PipelineStage } from "./types.ts";
export function derivePipelineStage(input: { explicit?: string | null; commercialStage?: string | null; quotationStatus?: string | null; reservationStatus?: string | null }): PipelineStage {
  if (PIPELINE_STAGES.includes(input.explicit as PipelineStage)) return input.explicit as PipelineStage;
  if (["CONFIRMED", "BOOKED"].includes(String(input.reservationStatus).toUpperCase())) return "GANADO";
  const value = String(input.commercialStage ?? "");
  if (value === "Quoting") return "COTIZACIÓN";
  if (["Waiting", "Contacted"].includes(value)) return value === "Waiting" ? "SEGUIMIENTO" : "CALIFICANDO";
  if (["Reserved"].includes(value)) return "RESERVA PENDIENTE";
  if (["Confirmed", "Production", "Finished"].includes(value)) return ["CONFIRMED", "BOOKED"].includes(String(input.reservationStatus).toUpperCase()) ? "GANADO" : "RESERVA PENDIENTE";
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
  if (input.stage === "GANADO" || input.stage === "PERDIDO" || input.optOut || input.humanHandoff || input.deliveryEnabled) return "BLOCKED";
  if (!input.nextActionAt) return "PAUSED";
  return new Date(input.nextActionAt).getTime() <= (input.now ?? new Date()).getTime() ? "DUE" : "SCHEDULED";
}
export function actionUrgency(nextActionAt: string | null, now = new Date()): SalesUrgency {
  if (!nextActionAt) return "SIN ACCIÓN";
  const date = new Date(nextActionAt); if (date.getTime() < now.getTime()) return "ATRASADO";
  return date.toDateString() === now.toDateString() ? "HOY" : "PRÓXIMAMENTE";
}
export type SalesUrgency = "HOY" | "ATRASADO" | "PRÓXIMAMENTE" | "SIN ACCIÓN";

export const PIPELINE_STAGES = ["NUEVO", "CALIFICANDO", "COTIZACIÓN", "SEGUIMIENTO", "RESERVA PENDIENTE", "GANADO", "PERDIDO"] as const;
export const LEAD_SOURCES = ["WHATSAPP", "WEB", "INSTAGRAM", "REFERIDO", "EMPRESA", "MANUAL", "OTRO", "UNKNOWN"] as const;
export const NEXT_ACTION_TYPES = ["LLAMAR", "WHATSAPP", "EMAIL", "REVISAR", "COTIZAR", "SEGUIMIENTO", "OTRO"] as const;
export const FOLLOW_UP_STATUSES = ["SCHEDULED", "DUE", "PAUSED", "CANCELLED", "COMPLETED", "BLOCKED"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type NextActionType = (typeof NEXT_ACTION_TYPES)[number];
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
export interface SalesLead { id: string; customerId: string; customerName: string; company: string; eventId: string; eventName: string; eventType: string; eventDate: string | null; service: string; source: LeadSource; stage: PipelineStage; estimatedValue: number | null; nextActionAt: string | null; nextActionType: NextActionType | null; followUpStatus: FollowUpStatus | null; lastActivityAt: string | null; overdue: boolean; urgency: "HOY" | "ATRASADO" | "PRÓXIMAMENTE" | "SIN ACCIÓN"; lostReason: string | null; }
export interface SalesPipelineData { leads: readonly SalesLead[]; counts: Readonly<Record<PipelineStage, number>>; metrics: { newLeads: number; quotes: number; reservations: number; won: number; lost: number; estimatedValue: number; overdue: number; }; }

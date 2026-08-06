import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateOperationalPayroll } from "./payroll-engine";
import { canPerformTask } from "./payroll.rules";
import type { OperationalTask, PayrollCalculation, SantiagoProvince, StaffGroup } from "./types";

export interface PersistPayrollInput {
  readonly assignmentId: string;
  readonly contractedHours: number;
  readonly tasks: readonly OperationalTask[];
  readonly province: SantiagoProvince;
  readonly parkingPayment?: number;
  readonly parkingReason?: string;
}

export class SupabasePayrollRepository {
  constructor(private readonly client: SupabaseClient) {}

  async calculateAndPersist(input: PersistPayrollInput): Promise<PayrollCalculation> {
    const actorId = await this.actor();
    const { data: assignment, error } = await this.client.from("assignments")
      .select("id,project_id,staff_id,projects!inner(orbit_event_id),staff!inner(operational_group,deleted_at)")
      .eq("id", input.assignmentId).is("deleted_at", null).single();
    if (error) throw error;
    const context = assignment as unknown as { project_id: string; staff_id: string; projects: { orbit_event_id: string }; staff: { operational_group: StaffGroup | null; deleted_at: string | null } };
    if (context.staff.deleted_at || !context.staff.operational_group) throw new Error("El colaborador no tiene un grupo operacional activo.");
    const invalidTask = input.tasks.find((task) => !canPerformTask(context.staff.operational_group!, task));
    if (invalidTask) throw new Error("El colaborador no está habilitado para la tarea seleccionada.");
    if ((input.parkingPayment ?? 0) > 0 && !input.parkingReason?.trim()) throw new Error("El estacionamiento excepcional requiere un motivo.");

    const calculation = calculateOperationalPayroll({ contractedHours: input.contractedHours, tasks: input.tasks, province: input.province, approvedParking: input.parkingPayment });
    const correlationId = crypto.randomUUID();
    const row = {
      project_id: context.project_id, assignment_id: input.assignmentId, staff_id: context.staff_id,
      orbit_event_id: context.projects.orbit_event_id, contracted_hours: input.contractedHours, tasks: input.tasks,
      destination_province: input.province, assembly_payment: calculation.assemblyPayment,
      operator_payment: calculation.operatorPayment, disassembly_payment: calculation.disassemblyPayment,
      transport_bonus: calculation.transportBonus, parking_payment: calculation.parkingPayment,
      parking_approved_by: calculation.parkingPayment ? actorId : null, parking_approved_at: calculation.parkingPayment ? new Date().toISOString() : null,
      parking_reason: calculation.parkingPayment ? input.parkingReason!.trim() : null, created_by: actorId, updated_by: actorId,
    };
    const { data: payment, error: persistError } = await this.client.from("event_staff_payments").upsert(row, { onConflict: "assignment_id" }).select("id").single();
    if (persistError) throw persistError;
    const humanMessage = calculation.parkingPayment > 0 ? "Pago operacional calculado con estacionamiento excepcional aprobado." : "Pago operacional calculado correctamente.";
    const { error: timelineError } = await this.client.from("timeline_events").insert({
      project_id: context.project_id, staff_id: context.staff_id, event_type: "STAFF_PAYMENT_CALCULATED", title: "Pago operacional calculado.",
      description: humanMessage, orbit_event_id: context.projects.orbit_event_id, actor_id: actorId, actor_label: "Administrador",
      source: "Administrator", action: calculation.parkingPayment > 0 ? "PARKING_PAYMENT_APPROVED" : "STAFF_PAYMENT_CALCULATED",
      entity_type: "EventStaffPayment", entity_id: payment.id, human_message: humanMessage, correlation_id: correlationId, created_by: actorId,
    });
    if (timelineError) throw timelineError;
    return calculation;
  }

  private async actor(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw error ?? new Error("Sesión requerida.");
    return data.user.id;
  }
}

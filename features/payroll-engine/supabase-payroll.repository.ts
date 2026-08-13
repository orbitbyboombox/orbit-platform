import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationalTask, PayrollCalculation, SantiagoProvince } from "./types";

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
    const { data: assignment, error } = await this.client.from("assignments")
      .select("id,project_id,staff_id")
      .eq("id", input.assignmentId).is("deleted_at", null).single();
    if (error) throw error;
    const context=assignment as {project_id:string;staff_id:string};
    const {data:paymentId,error:refreshError}=await this.client.rpc("refresh_staff_event_payment",{p_project_id:context.project_id,p_staff_id:context.staff_id});
    if(refreshError)throw refreshError;if(!paymentId)throw new Error("El Evento no tiene una asignación operacional activa.");
    const{data:payment,error:paymentError}=await this.client.from("event_staff_payments").select("assembly_payment,operator_payment,disassembly_payment,transport_bonus,parking_payment,total_internal_payment").eq("id",paymentId).single();
    if(paymentError)throw paymentError;
    return{assemblyPayment:Number(payment.assembly_payment),operatorPayment:Number(payment.operator_payment),disassemblyPayment:Number(payment.disassembly_payment),transportBonus:Number(payment.transport_bonus),parkingPayment:Number(payment.parking_payment),totalInternalPayment:Number(payment.total_internal_payment)};
  }
}

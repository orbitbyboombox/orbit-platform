import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationalTask, TaskPriority, TaskStatus } from "./types";

type TaskRow = {
  id:string; title:string; description:string|null; customer_id:string|null; project_id:string|null; orbit_event_id:string|null;
  assigned_to:string|null; priority:TaskPriority; status:TaskStatus; due_at:string|null; created_at:string; completed_at:string|null;
  source_module:string; timeline_reference:string|null; audit_reference:number|null; version:number;
  customers:{full_name:string}|null; projects:{name:string}|null; profiles:{display_name:string}|null;
};

export class SupabaseTaskCenterRepository {
  constructor(private readonly client:SupabaseClient) {}

  async materializeScheduledTasks() {
    const { error } = await this.client.rpc("materialize_scheduled_event_tasks");
    if (error) throw error;
  }

  async findAll():Promise<OperationalTask[]> {
    const { data, error } = await this.client.from("tasks").select("id,title,description,customer_id,project_id,orbit_event_id,assigned_to,priority,status,due_at,created_at,completed_at,source_module,timeline_reference,audit_reference,version,customers(full_name),projects(name),profiles!tasks_assigned_to_fkey(display_name)").is("deleted_at",null).order("due_at",{ascending:true,nullsFirst:false}).order("created_at",{ascending:false});
    if (error) throw error;
    return ((data ?? []) as unknown as TaskRow[]).map((row) => ({
      id:row.id,title:row.title,description:row.description,customerId:row.customer_id,customerName:row.customers?.full_name ?? null,
      projectId:row.project_id,projectName:row.projects?.name ?? null,orbitEventId:row.orbit_event_id,assignedTo:row.assigned_to,
      assignedUser:row.profiles?.display_name ?? null,priority:row.priority,status:row.status,dueAt:row.due_at,createdAt:row.created_at,
      completedAt:row.completed_at,sourceModule:row.source_module,timelineReference:row.timeline_reference,auditReference:row.audit_reference,version:row.version,
    }));
  }

  async create(input:{title:string;description?:string;projectId?:string;assignedTo?:string;priority:TaskPriority;dueAt?:string}) {
    const { data:auth, error:authError } = await this.client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
    let scope:{customer_id?:string;orbit_event_id?:string} = {};
    if (input.projectId) {
      const { data:project,error } = await this.client.from("projects").select("customer_id,orbit_event_id").eq("id",input.projectId).single();
      if (error) throw error;
      scope = project;
    }
    const { error } = await this.client.from("tasks").insert({title:input.title.trim(),description:input.description?.trim()||null,project_id:input.projectId||null,customer_id:scope.customer_id??null,orbit_event_id:scope.orbit_event_id??null,assigned_to:input.assignedTo||null,priority:input.priority,status:"PENDING",due_at:input.dueAt||null,source_module:"MANUAL",created_by:auth.user.id});
    if (error) throw error;
  }

  async updateStatus(id:string,status:TaskStatus,expectedVersion:number) {
    const { data,error } = await this.client.from("tasks").update({status}).eq("id",id).eq("version",expectedVersion).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("La tarea cambió en otra sesión. Recarga la página.");
  }
}

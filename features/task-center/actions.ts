"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { SupabaseTaskCenterRepository } from "./task-center.repository";
import type { TaskPriority, TaskStatus } from "./types";

type Result = {ok:true}|{ok:false;error:string};
const failure = (error:unknown):Result => ({ok:false,error:error instanceof Error?error.message:"No fue posible actualizar la tarea."});

export async function createOperationalTaskAction(input:{title:string;description?:string;projectId?:string;assignedTo?:string;priority:TaskPriority;dueAt?:string}):Promise<Result> {
  try { await new SupabaseTaskCenterRepository(await createSupabaseServerActionClient()).create(input); revalidatePath("/tasks"); revalidatePath("/operations"); return {ok:true}; }
  catch(error){ return failure(error); }
}

export async function updateOperationalTaskStatusAction(input:{id:string;status:TaskStatus;expectedVersion:number}):Promise<Result> {
  try { await new SupabaseTaskCenterRepository(await createSupabaseServerActionClient()).updateStatus(input.id,input.status,input.expectedVersion); revalidatePath("/tasks"); revalidatePath("/operations"); return {ok:true}; }
  catch(error){ return failure(error); }
}

"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseAssetRepository } from "./supabase-asset.repository";

type Result = { ok: true } | { ok: false; error: string };
const failure = (error: unknown): Result => ({ ok: false, error: error instanceof Error ? error.message : "No fue posible actualizar el equipo." });

export async function assignOperationalAssetAction(input: { projectId: string; assetId: string; orbitEventId: string; reason: string }): Promise<Result> {
  try { await new SupabaseAssetRepository(await createSupabaseServerClient()).assign(input); revalidatePath(`/projects/${input.projectId}`); return { ok: true }; } catch (error) { return failure(error); }
}

export async function releaseOperationalAssetAction(input: { projectId: string; assignmentId: string; reason: string }): Promise<Result> {
  try { await new SupabaseAssetRepository(await createSupabaseServerClient()).release(input.assignmentId, input.reason); revalidatePath(`/projects/${input.projectId}`); revalidatePath("/operations"); return { ok: true }; } catch (error) { return failure(error); }
}

export async function assignPhysicalResourcesAction(input: { projectId: string; requirementId: string; assetIds: string[]; reason: string }): Promise<Result> {
  try {
    const client=await createSupabaseServerClient();
    const{error}=await client.rpc("assign_operational_assets",{p_project_id:input.projectId,p_requirement_id:input.requirementId,p_asset_ids:input.assetIds,p_reason:input.reason});
    if(error)throw error;
    revalidatePath(`/projects/${input.projectId}`);revalidatePath("/operations");return{ok:true};
  }catch(error){return failure(error);}
}

export async function replacePhysicalResourceAction(input: { projectId: string; assignmentId: string; assetId: string; reason: string }): Promise<Result> {
  try{
    const client=await createSupabaseServerClient();
    const{error}=await client.rpc("replace_operational_asset",{p_assignment_id:input.assignmentId,p_new_asset_id:input.assetId,p_reason:input.reason});
    if(error)throw error;
    revalidatePath(`/projects/${input.projectId}`);revalidatePath("/operations");return{ok:true};
  }catch(error){return failure(error);}
}

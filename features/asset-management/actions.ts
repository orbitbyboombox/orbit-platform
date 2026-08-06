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
  try { await new SupabaseAssetRepository(await createSupabaseServerClient()).release(input.assignmentId, input.reason); revalidatePath(`/projects/${input.projectId}`); return { ok: true }; } catch (error) { return failure(error); }
}

"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseStaffRepository } from "../infrastructure";
import type { StaffAssignmentDraft, StaffDraft, StaffUpdate } from "../infrastructure";

type ActionResult = { ok: true } | { ok: false; error: string };
const errorResult = (error: unknown): ActionResult => ({ ok: false, error: error instanceof Error ? error.message : "No fue posible actualizar Staff." });
async function repository() { return new SupabaseStaffRepository(await createSupabaseServerClient()); }
const refresh = () => revalidatePath("/resources/staff");

export async function createStaffAction(input: StaffDraft): Promise<ActionResult & { staffId?: string }> { try { const staffId = await (await repository()).create(input); refresh(); return { ok: true, staffId }; } catch (error) { return errorResult(error); } }
export async function updateStaffAction(input: StaffUpdate): Promise<ActionResult> { try { await (await repository()).update(input); refresh(); return { ok: true }; } catch (error) { return errorResult(error); } }
export async function assignStaffAction(input: StaffAssignmentDraft): Promise<ActionResult & { assignmentId?: string }> { try { const assignmentId = await (await repository()).assign(input); refresh(); return { ok: true, assignmentId }; } catch (error) { return errorResult(error); } }
export async function removeStaffAssignmentAction(assignmentId: string, reason: string): Promise<ActionResult> { try { await (await repository()).removeAssignment(assignmentId, reason); refresh(); return { ok: true }; } catch (error) { return errorResult(error); } }
export async function respondToStaffAssignmentAction(assignmentId: string, response: "ACCEPTED" | "REJECTED" | "ASSISTANCE_REQUESTED"): Promise<ActionResult> { try { await (await repository()).respondToAssignment(assignmentId, response); refresh(); return { ok: true }; } catch (error) { return errorResult(error); } }
export async function updateStaffAvailabilityAction(staffId: string, expectedVersion: number, availability: string, status: "AVAILABLE" | "ASSIGNED" | "UNAVAILABLE" | "INACTIVE", reason: string): Promise<ActionResult> { try { await (await repository()).updateAvailability(staffId, expectedVersion, availability, status, reason); refresh(); return { ok: true }; } catch (error) { return errorResult(error); } }
export async function softDeleteStaffAction(staffId: string, expectedVersion: number, reason: string): Promise<ActionResult> { try { await (await repository()).softDelete(staffId, expectedVersion, reason); refresh(); return { ok: true }; } catch (error) { return errorResult(error); } }
export async function restoreStaffAction(staffId: string, expectedVersion: number, reason: string): Promise<ActionResult> { try { await (await repository()).restore(staffId, expectedVersion, reason); refresh(); return { ok: true }; } catch (error) { return errorResult(error); } }
export async function recordStaffOperationalEventAction(assignmentId: string, action: "ARRIVAL_RECORDED" | "MOUNTING_STARTED" | "MOUNTING_COMPLETED" | "EVENT_STARTED" | "EVENT_FINISHED" | "DISMANTLING_STARTED" | "DISMANTLING_COMPLETED" | "RETURNED_TO_WAREHOUSE", humanMessage: string): Promise<ActionResult> { try { await (await repository()).recordOperationalEvent(assignmentId, action, humanMessage); refresh(); return { ok: true }; } catch (error) { return errorResult(error); } }

"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function adminClosePaperBlockAction(input: {
  projectId: string; blockId: string; assignmentId: string;
  opening: number; reloads: number; remaining: number; reason: string; requestId: string;
}) {
  const client = await createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Sesión administrativa requerida.");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError || profile?.role !== "CEO") throw new Error("Sólo Founder puede realizar un cierre manual.");
  const reason = input.reason.trim();
  if (reason.length < 10) throw new Error("Indica el motivo del cierre manual (mínimo 10 caracteres).");
  for (const value of [input.opening, input.reloads, input.remaining]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Los valores de papel deben ser enteros no negativos.");
  }
  if (input.remaining > input.opening + input.reloads) throw new Error("El saldo final supera el papel disponible.");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_record_staff_paper_block_closeout", {
    p_project_id: input.projectId, p_block_id: input.blockId,
    p_operator_assignment_id: input.assignmentId, p_opening: input.opening,
    p_reloads: input.reloads, p_remaining: input.remaining,
    p_request_id: input.requestId, p_admin_user_id: auth.user.id, p_reason: reason,
  });
  if (error) throw error;
  revalidatePath(`/admin/totems/${input.projectId}`);
  revalidatePath("/staff-portal");
  return { ok: true as const, data };
}

export async function loadAdminPaperBlocksAction(projectId: string) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "CEO") throw new Error("Acceso administrativo requerido.");
  const admin = createAdminClient();
  const [{ data: project, error: projectError }, { data: blocks, error: blockError }, { data: assignments, error: assignmentError }, { data: assets, error: assetError }, { data: closeouts, error: closeoutError }, { data: snapshots, error: snapshotError }] = await Promise.all([
    admin.from("projects").select("operations").eq("id", projectId).single(),
    admin.from("event_operational_blocks").select("id,name,sequence").eq("project_id", projectId),
    admin.from("assignments").select("id,staff_id,block_id,assignment_type,status,staff(first_name,last_name)").eq("project_id", projectId).is("deleted_at", null),
    admin.from("operational_assets").select("id,asset_code").is("deleted_at", null),
    admin.from("event_box_paper_block_closeouts").select("asset_id,block_id,opening,reloads,remaining,used,closed_at").eq("project_id", projectId),
    admin.from("event_paper_snapshots").select("id,box_asset_id,opening_balance,created_at").eq("project_id", projectId).order("created_at", { ascending: true }),
  ]);
  for (const error of [projectError, blockError, assignmentError, assetError, closeoutError, snapshotError]) if (error) throw error;
  type Position = { assetId?: string; blocks?: { blockId?: string; assignmentId?: string }[] };
  const positions = (project?.operations as { totemLayout?: { positions?: Position[] } } | null)?.totemLayout?.positions ?? [];
  const assetMap = new Map((assets ?? []).map((row) => [row.id, row.asset_code]));
  const blockMap = new Map((blocks ?? []).map((row) => [row.id, row]));
  const assignmentMap = new Map((assignments ?? []).map((row) => [row.id, row]));
  const snapshotMap = new Map<string, NonNullable<typeof snapshots>[number]>();
  for (const row of snapshots ?? []) if (!snapshotMap.has(row.box_asset_id)) snapshotMap.set(row.box_asset_id, row);
  const snapshotIds = (snapshots ?? []).map((row) => row.id);
  const { data: reloadRows, error: reloadError } = snapshotIds.length
    ? await admin.from("event_paper_reloads").select("snapshot_id,quantity").in("snapshot_id", snapshotIds)
    : { data: [], error: null };
  if (reloadError) throw reloadError;
  const reloadMap = new Map<string, number>();
  for (const row of reloadRows ?? []) reloadMap.set(row.snapshot_id, (reloadMap.get(row.snapshot_id) ?? 0) + Number(row.quantity));
  return (Array.isArray(positions) ? positions : []).flatMap((position) => (position.blocks ?? []).flatMap((shift) => {
    const block = blockMap.get(shift.blockId ?? "");
    const assignment = assignmentMap.get(shift.assignmentId ?? "");
    if (!position.assetId || !block || !assignment || assignment.block_id !== block.id || assignment.assignment_type !== "OPERATOR") return [];
    const current = (closeouts ?? []).find((row) => row.asset_id === position.assetId && row.block_id === block.id);
    const previous = (closeouts ?? []).filter((row) => row.asset_id === position.assetId && Number(blockMap.get(row.block_id)?.sequence ?? Infinity) < Number(block.sequence)).sort((a,b) => Number(blockMap.get(b.block_id)?.sequence ?? 0) - Number(blockMap.get(a.block_id)?.sequence ?? 0))[0];
    const isFirst = !(blocks ?? []).some((row) => Number(row.sequence) < Number(block.sequence));
    const snapshot = snapshotMap.get(position.assetId);
    const staff = assignment.staff as unknown as { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
    const person = Array.isArray(staff) ? staff[0] : staff;
    return [{
      assetId: position.assetId, boxCode: assetMap.get(position.assetId) ?? "Caja",
      blockId: block.id, blockName: block.name, sequence: Number(block.sequence),
      assignmentId: assignment.id, operator: [person?.first_name, person?.last_name].filter(Boolean).join(" "),
      opening: Number(current?.opening ?? previous?.remaining ?? snapshot?.opening_balance ?? 0),
      reloads: Number(current?.reloads ?? (isFirst && snapshot ? reloadMap.get(snapshot.id) ?? 0 : 0)),
      remaining: current?.remaining == null ? null : Number(current.remaining),
      closed: Boolean(current), canClose: isFirst ? Boolean(snapshot) : Boolean(previous),
    }];
  })).sort((a,b) => a.boxCode.localeCompare(b.boxCode) || a.sequence - b.sequence);
}

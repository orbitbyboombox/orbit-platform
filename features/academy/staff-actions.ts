"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession } from "@/features/portal-authentication/portal-auth.service";
async function context(articleId: string) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) throw new Error("Tu sesión expiró.");
  const admin = createAdminClient(),
    { data: article, error } = await admin
      .from("academy_articles")
      .select(
        "id,current_version,academy_article_versions!inner(id,version_number)",
      )
      .eq("id", articleId)
      .eq("status", "PUBLISHED")
      .single();
  if (error || !article)
    throw new Error("Este contenido ya no está disponible.");
  const version = (article.academy_article_versions ?? []).find(
    (item) => item.version_number === article.current_version,
  );
  if (!version) throw new Error("Versión no disponible.");
  return { admin, staffId: session.staff_id, articleId, versionId: version.id };
}
export async function markAcademyProgressAction(
  articleId: string,
  completed = false,
  watchedSeconds = 0,
) {
  try {
    const { admin, staffId, versionId } = await context(articleId),
      now = new Date().toISOString(),
      { data: existing } = await admin
        .from("academy_staff_progress")
        .select("completed_at,watched_seconds")
        .eq("staff_id", staffId)
        .eq("article_id", articleId)
        .eq("version_id", versionId)
        .maybeSingle();
    const { error } = await admin.from("academy_staff_progress").upsert(
      {
        staff_id: staffId,
        article_id: articleId,
        version_id: versionId,
        last_accessed_at: now,
        viewed_at: now,
        completed_at: completed ? now : existing?.completed_at,
        watched_seconds: Math.max(
          Number(existing?.watched_seconds ?? 0),
          Math.max(0, Math.floor(watchedSeconds)),
        ),
      },
      { onConflict: "staff_id,article_id,version_id" },
    );
    if (error) throw error;
    revalidatePath("/staff-portal/academy");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No fue posible registrar el avance.",
    };
  }
}
export async function toggleAcademyChecklistItemAction(
  articleId: string,
  itemId: string,
  completed: boolean,
) {
  try {
    const { admin, staffId, versionId } = await context(articleId),
      now = new Date().toISOString();
    if (completed) {
      const { error } = await admin.from("academy_checklist_progress").upsert(
        {
          staff_id: staffId,
          article_id: articleId,
          version_id: versionId,
          item_id: itemId,
          completed_at: now,
        },
        { onConflict: "staff_id,item_id" },
      );
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("academy_checklist_progress")
        .delete()
        .eq("staff_id", staffId)
        .eq("item_id", itemId);
      if (error) throw error;
    }
    const { count } = await admin
        .from("academy_checklist_items")
        .select("id", { count: "exact", head: true })
        .eq("version_id", versionId),
      { count: done } = await admin
        .from("academy_checklist_progress")
        .select("id", { count: "exact", head: true })
        .eq("staff_id", staffId)
        .eq("version_id", versionId);
    await admin.from("academy_staff_progress").upsert(
      {
        staff_id: staffId,
        article_id: articleId,
        version_id: versionId,
        last_accessed_at: now,
        viewed_at: now,
        completed_at: count && done === count ? now : null,
      },
      { onConflict: "staff_id,article_id,version_id" },
    );
    revalidatePath("/staff-portal/academy");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No fue posible actualizar el checklist.",
    };
  }
}

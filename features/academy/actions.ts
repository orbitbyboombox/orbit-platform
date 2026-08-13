"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import type { AcademyType } from "./types";
type Result = { ok: true; message: string } | { ok: false; message: string };
type PriorFile = {
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  thumbnail_path: string | null;
};
const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "No fue posible actualizar BOOMBOX Academy.";
async function founder() {
  const client = await createSupabaseServerActionClient(),
    { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (profile?.role !== "CEO")
    throw new Error("Solo Founder puede administrar BOOMBOX Academy.");
  return { client, userId: auth.user.id };
}
export async function saveAcademyArticleAction(
  data: FormData,
): Promise<Result> {
  try {
    const { client, userId } = await founder(),
      articleId = text(data, "articleId"),
      type = text(data, "type") as AcademyType,
      title = text(data, "title"),
      description = text(data, "description"),
      category = text(data, "category"),
      body = text(data, "body"),
      versionLabel = text(data, "versionLabel") || "1.0",
      filePath = text(data, "filePath") || null,
      fileName = text(data, "fileName") || null,
      mimeType = text(data, "mimeType") || null,
      fileSize = Number(data.get("fileSize") ?? 0) || null,
      durationSeconds = Number(data.get("durationSeconds") ?? 0) || null,
      thumbnailPath = text(data, "thumbnailPath") || null,
      keywords = text(data, "keywords")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      items = text(data, "checklistItems")
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
    if (!title || !category || !type)
      throw new Error("Completa título, categoría y tipo.");
    let id = articleId,
      current = 0,
      prior: PriorFile | null = null;
    if (articleId) {
      const { data: article, error } = await client
        .from("academy_articles")
        .select("current_version")
        .eq("id", articleId)
        .single();
      if (error) throw error;
      current = article.current_version;
      const { data: previous } = await client
        .from("academy_article_versions")
        .select("file_path,file_name,mime_type,file_size,thumbnail_path")
        .eq("article_id", articleId)
        .eq("version_number", current)
        .single();
      prior = previous;
      const { error: updateError } = await client
        .from("academy_articles")
        .update({
          article_type: type,
          category,
          current_version: current + 1,
          updated_by: userId,
        })
        .eq("id", articleId);
      if (updateError) throw updateError;
    } else {
      const { data: article, error } = await client
        .from("academy_articles")
        .insert({
          article_type: type,
          category,
          created_by: userId,
          updated_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      id = article.id;
    }
    const { data: version, error: versionError } = await client
      .from("academy_article_versions")
      .insert({
        article_id: id,
        version_number: current + 1,
        version_label: versionLabel,
        title,
        description,
        body,
        keywords,
        file_bucket: filePath || prior?.file_path ? "orbit-academy" : null,
        file_path: filePath || prior?.file_path,
        file_name: fileName || prior?.file_name,
        mime_type: mimeType || prior?.mime_type,
        file_size: fileSize || prior?.file_size,
        duration_seconds: durationSeconds,
        thumbnail_path: thumbnailPath || prior?.thumbnail_path,
        published_on: new Date().toISOString().slice(0, 10),
        created_by: userId,
      })
      .select("id")
      .single();
    if (versionError) throw versionError;
    if (type === "CHECKLIST" && items.length) {
      const { error } = await client.from("academy_checklist_items").insert(
        items.map((label, index) => ({
          version_id: version.id,
          position: index + 1,
          label,
        })),
      );
      if (error) throw error;
    }
    revalidatePath("/resources/staff");
    revalidatePath("/staff-portal/academy");
    return {
      ok: true,
      message: articleId
        ? "Nueva versión guardada."
        : "Artículo creado como borrador.",
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
export async function setAcademyArticleStatusAction(
  articleId: string,
  status: "PUBLISHED" | "HIDDEN" | "ARCHIVED" | "DELETED",
): Promise<Result> {
  try {
    const { client, userId } = await founder(),
      now = new Date().toISOString();
    const { error } = await client
      .from("academy_articles")
      .update({
        status,
        published_at: status === "PUBLISHED" ? now : null,
        archived_at: status === "ARCHIVED" ? now : null,
        updated_by: userId,
      })
      .eq("id", articleId);
    if (error) throw error;
    revalidatePath("/resources/staff");
    revalidatePath("/staff-portal/academy");
    return {
      ok: true,
      message:
        status === "PUBLISHED"
          ? "Artículo publicado."
          : status === "DELETED"
            ? "Artículo eliminado del catálogo."
            : "Estado actualizado.",
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

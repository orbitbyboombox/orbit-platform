import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AcademyArticle,
  AcademyProgress,
  AcademyStaffStat,
  AcademyType,
} from "./types";

export async function loadAcademyArticles(
  client: SupabaseClient,
  { staff = false }: { staff?: boolean } = {},
) {
  let query = client
    .from("academy_articles")
    .select(
      "id,article_type,category,status,current_version,published_at,academy_article_versions!inner(id,version_number,version_label,title,description,body,keywords,file_name,file_path,mime_type,file_size,duration_seconds,thumbnail_path,published_on,created_at,academy_checklist_items(id,position,label))",
    )
    .order("updated_at", { ascending: false });
  if (staff) query = query.eq("status", "PUBLISHED");
  else query = query.not("status", "eq", "DELETED");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const versions = (row.academy_article_versions ?? []).filter(
      (version) => version.version_number === row.current_version,
    );
    const version = versions[0];
    if (!version) return [];
    return [
      {
        id: row.id,
        type: row.article_type as AcademyType,
        category: row.category,
        status: row.status,
        currentVersion: row.current_version,
        publishedAt: row.published_at,
        versionId: version.id,
        versionLabel: version.version_label,
        title: version.title,
        description: version.description,
        body: version.body,
        keywords: version.keywords ?? [],
        fileName: version.file_name,
        filePath: version.file_path,
        mimeType: version.mime_type,
        fileSize: version.file_size === null ? null : Number(version.file_size),
        durationSeconds: version.duration_seconds,
        thumbnailPath: version.thumbnail_path,
        publishedOn: version.published_on,
        items: [...(version.academy_checklist_items ?? [])].sort(
          (a, b) => a.position - b.position,
        ),
        versions: [...(row.academy_article_versions ?? [])]
          .sort((a, b) => b.version_number - a.version_number)
          .map((item) => ({
            id: item.id,
            versionNumber: item.version_number,
            versionLabel: item.version_label,
            publishedOn: item.published_on,
            createdAt: item.created_at,
          })),
      },
    ] as AcademyArticle[];
  });
}

export async function loadStaffAcademyProgress(
  client: SupabaseClient,
  staffId: string,
) {
  const [{ data: progress, error }, { data: items, error: itemError }] =
    await Promise.all([
      client
        .from("academy_staff_progress")
        .select(
          "staff_id,article_id,version_id,viewed_at,completed_at,watched_seconds,last_accessed_at",
        )
        .eq("staff_id", staffId),
      client
        .from("academy_checklist_progress")
        .select("item_id")
        .eq("staff_id", staffId),
    ]);
  if (error || itemError) throw error ?? itemError;
  return {
    progress: (progress ?? []).map((row) => ({
      staffId: row.staff_id,
      articleId: row.article_id,
      versionId: row.version_id,
      viewedAt: row.viewed_at,
      completedAt: row.completed_at,
      watchedSeconds: row.watched_seconds,
      lastAccessedAt: row.last_accessed_at,
    })) as AcademyProgress[],
    completedItems: (items ?? []).map((row) => row.item_id),
  };
}

export async function loadAcademyStats(
  client: SupabaseClient,
  articles: AcademyArticle[],
): Promise<AcademyStaffStat[]> {
  const [{ data: staff, error }, { data: progress, error: progressError }] =
    await Promise.all([
      client
        .from("staff")
        .select("id,first_name,last_name")
        .eq("status", "ACTIVE")
        .is("deleted_at", null)
        .order("last_name"),
      client
        .from("academy_staff_progress")
        .select("staff_id,article_id,viewed_at,completed_at,last_accessed_at"),
    ]);
  if (error || progressError) throw error ?? progressError;
  const published = articles.filter((item) => item.status === "PUBLISHED"),
    total = published.length;
  return (staff ?? []).map((member) => {
    const rows = (progress ?? []).filter(
        (row) =>
          row.staff_id === member.id &&
          published.some((article) => article.id === row.article_id),
      ),
      completed = new Set(
        rows
          .filter((row) => row.completed_at || row.viewed_at)
          .map((row) => row.article_id),
      );
    return {
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      manualsRead: new Set(
        rows
          .filter(
            (row) =>
              row.viewed_at &&
              published.find((article) => article.id === row.article_id)
                ?.type === "MANUAL",
          )
          .map((row) => row.article_id),
      ).size,
      videosWatched: new Set(
        rows
          .filter(
            (row) =>
              row.completed_at &&
              published.find((article) => article.id === row.article_id)
                ?.type === "VIDEO",
          )
          .map((row) => row.article_id),
      ).size,
      lastAccess:
        rows
          .map((row) => row.last_accessed_at)
          .sort()
          .at(-1) ?? null,
      completion: total ? Math.round((completed.size / total) * 100) : 0,
    };
  });
}

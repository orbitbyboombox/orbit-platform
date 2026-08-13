import { NextResponse } from "next/server";
import { loadPortalSession } from "@/features/portal-authentication/portal-auth.service";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ articleId: string }> },
) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id)
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const { articleId } = await params,
    admin = createAdminClient(),
    { data: article } = await admin
      .from("academy_articles")
      .select(
        "id,current_version,academy_article_versions!inner(id,version_number,file_path,file_name,thumbnail_path)",
      )
      .eq("id", articleId)
      .eq("status", "PUBLISHED")
      .single(),
    version = article?.academy_article_versions?.find(
      (item) => item.version_number === article.current_version,
    );
  if (!article || !version)
    return NextResponse.json(
      { error: "Archivo no disponible." },
      { status: 404 },
    );
  const thumbnail = new URL(request.url).searchParams.has("thumbnail"),
    assetPath = thumbnail ? version?.thumbnail_path : version?.file_path;
  if (!assetPath)
    return NextResponse.json(
      { error: "Archivo no disponible." },
      { status: 404 },
    );
  const now = new Date().toISOString();
  await admin.from("academy_staff_progress").upsert(
    {
      staff_id: session.staff_id,
      article_id: article.id,
      version_id: version.id,
      last_accessed_at: now,
      viewed_at: now,
    },
    { onConflict: "staff_id,article_id,version_id" },
  );
  const { data, error } = await admin.storage
    .from("orbit-academy")
    .createSignedUrl(assetPath, 300, {
      download: new URL(request.url).searchParams.has("download")
        ? (version.file_name ?? true)
        : false,
    });
  if (error)
    return NextResponse.json(
      { error: "Archivo no disponible." },
      { status: 404 },
    );
  return NextResponse.redirect(data.signedUrl);
}

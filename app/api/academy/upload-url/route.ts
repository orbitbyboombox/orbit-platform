import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
const allowed = new Set([
  "application/pdf",
  "video/mp4",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export async function POST(request: Request) {
  const client = await createSupabaseServerClient(),
    { data: auth } = await client.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (profile?.role !== "CEO")
    return NextResponse.json(
      { error: "Solo Founder puede subir contenido." },
      { status: 403 },
    );
  const body = (await request.json()) as {
    name?: string;
    type?: string;
    size?: number;
  };
  if (!body.name || !body.type || !allowed.has(body.type))
    return NextResponse.json(
      { error: "Tipo de archivo no permitido." },
      { status: 400 },
    );
  if (Number(body.size) > 1_073_741_824)
    return NextResponse.json(
      { error: "El archivo supera 1 GB." },
      { status: 413 },
    );
  const extension =
      body.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "bin",
    path = `library/${new Date().getFullYear()}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await client.storage
    .from("orbit-academy")
    .createSignedUploadUrl(path);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}

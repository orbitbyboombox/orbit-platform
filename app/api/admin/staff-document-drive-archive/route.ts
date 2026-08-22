import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncStaffArchiveBackfill } from "@/features/staff-monthly-account/drive-archive.service";

export async function POST(request: Request) {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "") ?? "";
  const serviceRoleAuthorized =
    serviceRole.length === provided.length &&
    serviceRole.length > 0 &&
    timingSafeEqual(Buffer.from(serviceRole), Buffer.from(provided));

  if (!serviceRoleAuthorized) {
    const admin = await createSupabaseServerClient();
    const { data: session } = await admin.auth.getUser();
    if (!session.user) {
      return NextResponse.json({ message: "No autorizado." }, { status: 403 });
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) {
      return NextResponse.json({ message: "No autorizado." }, { status: 403 });
    }
  }

  const results = await syncStaffArchiveBackfill(createAdminClient());
  return NextResponse.json({
    processed: results.length,
    synced: results.filter((x) => x.status !== "ERROR").length,
    failed: results.filter((x) => x.status === "ERROR").length,
    results,
  });
}

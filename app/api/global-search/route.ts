import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { globalSearchHref, type GlobalSearchKind, type GlobalSearchResult } from "@/features/global-search/model";

type SearchRow = {
  entity_type: GlobalSearchKind;
  entity_id: string;
  title: string;
  subtitle: string;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 80) return NextResponse.json({ results: [] });
  const client = await createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ message: "Tu sesión expiró." }, { status: 401 });
  const { data, error } = await client.rpc("search_orbit_global", { p_query: query, p_limit: 8 });
  if (error) {
    console.error("[global-search]", { code: error.code, message: error.message });
    return NextResponse.json({ message: "No fue posible completar la búsqueda." }, { status: 500 });
  }
  const results: GlobalSearchResult[] = ((data ?? []) as SearchRow[]).map((row) => ({
    id: row.entity_id,
    kind: row.entity_type,
    title: row.title,
    subtitle: row.subtitle,
    href: globalSearchHref(row.entity_type, row.entity_id),
  }));
  return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}


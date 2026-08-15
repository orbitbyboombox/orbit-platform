import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CommercialCatalogCategory } from "./catalogs";

export async function loadActiveCommercialDocument(category: CommercialCatalogCategory) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("commercial_documents")
    .select("id,name,category,version,filename,storage_bucket,storage_path,status")
    .eq("category", category)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error) throw error;
  return data;
}

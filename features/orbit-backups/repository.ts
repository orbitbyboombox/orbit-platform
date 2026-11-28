import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrbitBackupRun } from "./types";

export async function loadOrbitBackupRuns(client: SupabaseClient) {
  const { data, error } = await client
    .from("orbit_backup_runs")
    .select("id,status,requested_at,started_at,completed_at,github_run_id,workflow_url,source_sha,verified_at,file_count,total_bytes,drive_folder_id,sha256_manifest,error_code,error_message")
    .order("requested_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as OrbitBackupRun[];
}

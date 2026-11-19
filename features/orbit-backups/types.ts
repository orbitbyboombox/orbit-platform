export type OrbitBackupStatus = "EN_PROCESO" | "COMPLETO" | "ERROR";

export type OrbitBackupRun = {
  id: string;
  status: OrbitBackupStatus;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  github_run_id: number | null;
  workflow_url: string | null;
  file_count: number | null;
  total_bytes: number | null;
  drive_folder_id: string | null;
  sha256_manifest: string | null;
  error_code: string | null;
  error_message: string | null;
};

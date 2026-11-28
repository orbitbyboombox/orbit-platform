import Link from "next/link";
import { notFound } from "next/navigation";
import { getConnectorAdministrator } from "@/features/connectors/connector-administrator.guard";
import { OrbitBackupsCenter, loadOrbitBackupRuns } from "@/features/orbit-backups";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";

export default async function BackupSettingsPage() {
  if (!(await getConnectorAdministrator())) notFound();
  const runs = await loadOrbitBackupRuns(createAdminClient()).catch(() => null);
  return <main className="space-y-4">
    <Link href="/settings" className="text-sm font-semibold text-brand">Volver a Configuración</Link>
    {runs
      ? <OrbitBackupsCenter runs={runs} ready={Boolean(process.env.GITHUB_BACKUP_DISPATCH_TOKEN) && !isReadOnlyVisualPreview()} />
      : <p role="alert">No se pudo cargar el historial de respaldos.</p>}
  </main>;
}

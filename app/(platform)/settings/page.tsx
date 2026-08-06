import { ConnectionCenter } from "@/features/settings";
import { CommunicationHub, loadCommunicationHubProjection } from "@/features/communication-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDisconnectedGoogleWorkspaceConnection } from "@/features/connectors";
import { loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";

export default async function SettingsPage() {
  const communication = await loadCommunicationHubProjection(await createSupabaseServerClient());
  const googleConfigured = Boolean(process.env.GOOGLE_WORKSPACE_CLIENT_ID && process.env.GOOGLE_WORKSPACE_CLIENT_SECRET && process.env.GOOGLE_WORKSPACE_REDIRECT_URI);
  const googleConnection = googleConfigured
    ? await loadGoogleWorkspaceConnection().catch(() => createDisconnectedGoogleWorkspaceConnection("AUTHENTICATION_ERROR"))
    : createDisconnectedGoogleWorkspaceConnection();
  return (
    <div className="space-y-10 lg:space-y-12">
      <ConnectionCenter googleConfigured={googleConfigured} googleConnection={googleConnection} />
      <CommunicationHub {...communication} />
    </div>
  );
}

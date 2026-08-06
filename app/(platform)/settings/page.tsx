import { ConnectionCenter, loadMasterData, MasterDataCenter } from "@/features/settings";
import { CommunicationHub, loadCommunicationHubProjection } from "@/features/communication-hub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDisconnectedGoogleWorkspaceConnection } from "@/features/connectors";
import { loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";

export default async function SettingsPage() {
  const client = await createSupabaseServerClient();
  const [communication, masterData] = await Promise.all([loadCommunicationHubProjection(client), loadMasterData(client)]);
  const googleConfigured = Boolean(process.env.GOOGLE_WORKSPACE_CLIENT_ID && process.env.GOOGLE_WORKSPACE_CLIENT_SECRET && process.env.GOOGLE_WORKSPACE_REDIRECT_URI);
  const googleConnection = googleConfigured
    ? await loadGoogleWorkspaceConnection().catch(() => createDisconnectedGoogleWorkspaceConnection("AUTHENTICATION_ERROR"))
    : createDisconnectedGoogleWorkspaceConnection();
  return (
    <div className="space-y-10 lg:space-y-12">
      <MasterDataCenter {...masterData} />
      <div id="connections">
      <ConnectionCenter googleConfigured={googleConfigured} googleConnection={googleConnection} />
      </div>
      <CommunicationHub {...communication} />
    </div>
  );
}

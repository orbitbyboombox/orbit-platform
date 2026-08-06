import type {
  GoogleWorkspaceProvider,
  GoogleWorkspaceProviderSession,
} from "../provider/google-workspace.provider";
import type {
  GoogleWorkspaceAuthorizationRequest,
  GoogleWorkspaceConnection,
  GoogleWorkspaceConnectionHealth,
  GoogleWorkspaceConnectionResult,
  GoogleWorkspaceService,
  GoogleWorkspaceTokenStatus,
} from "../types/google-workspace.types";

const SERVICE_LABELS: Record<GoogleWorkspaceService, string> = {
  CALENDAR: "Google Calendar",
  DRIVE: "Google Drive",
  GMAIL: "Gmail",
};

export const GOOGLE_WORKSPACE_SERVICES = (Object.keys(SERVICE_LABELS) as GoogleWorkspaceService[]).map((id) => ({ id, label: SERVICE_LABELS[id] }));

export function resolveConnectionHealth(
  connectionStatus: GoogleWorkspaceConnection["connectionStatus"],
  tokenStatus: GoogleWorkspaceTokenStatus,
): GoogleWorkspaceConnectionHealth {
  if (connectionStatus === "DISCONNECTED") return "DISCONNECTED";
  if (tokenStatus === "AUTHENTICATION_ERROR") return "AUTHENTICATION_ERROR";
  if (tokenStatus === "EXPIRED") return "TOKEN_EXPIRED";
  if (connectionStatus === "ERROR" || tokenStatus === "REFRESH_REQUIRED") return "ATTENTION_REQUIRED";
  return "HEALTHY";
}

function sanitizeSession(session: GoogleWorkspaceProviderSession): GoogleWorkspaceConnection {
  const tokenStatus: GoogleWorkspaceTokenStatus = "HEALTHY";
  return {
    workspaceAccount: session.account,
    workspaceDomain: session.domain,
    connectionStatus: "CONNECTED",
    connectedSince: session.connectedSince,
    tokenStatus,
    grantedServices: GOOGLE_WORKSPACE_SERVICES.map((service) => ({ ...service, granted: session.grantedServices.includes(service.id) })),
    health: resolveConnectionHealth("CONNECTED", tokenStatus),
  };
}

export class GoogleWorkspaceConnector {
  constructor(private readonly provider: GoogleWorkspaceProvider) {}

  async connect(request: GoogleWorkspaceAuthorizationRequest): Promise<GoogleWorkspaceConnectionResult> {
    const result = await this.provider.connect(request);
    if (result.ok) return { ok: true, connection: sanitizeSession(result.session) };
    const connection = createDisconnectedGoogleWorkspaceConnection("AUTHENTICATION_ERROR");
    return { ok: false, connection, error: result.error };
  }

  async disconnect(connection: GoogleWorkspaceConnection): Promise<GoogleWorkspaceConnection> {
    if (connection.workspaceAccount) await this.provider.disconnect(connection.workspaceAccount);
    return createDisconnectedGoogleWorkspaceConnection();
  }
}

export function createDisconnectedGoogleWorkspaceConnection(
  tokenStatus: GoogleWorkspaceTokenStatus = "UNAVAILABLE",
): GoogleWorkspaceConnection {
  return {
    connectionStatus: "DISCONNECTED",
    tokenStatus,
    grantedServices: GOOGLE_WORKSPACE_SERVICES.map((service) => ({ ...service, granted: false })),
    health: resolveConnectionHealth("DISCONNECTED", tokenStatus),
  };
}

export function getCommandCenterConnectionStatus(connection: GoogleWorkspaceConnection) {
  return connection.connectionStatus;
}

export function getOperationsBoardConnectionHealth(connection: GoogleWorkspaceConnection) {
  return connection.health;
}

export type GoogleWorkspaceService = "CALENDAR" | "DRIVE" | "GMAIL";

export type GoogleWorkspaceConnectionStatus = "CONNECTED" | "DISCONNECTED" | "CONNECTING" | "ERROR";

export type GoogleWorkspaceTokenStatus = "HEALTHY" | "REFRESH_REQUIRED" | "EXPIRED" | "AUTHENTICATION_ERROR" | "UNAVAILABLE";

export type GoogleWorkspaceConnectionHealth = "HEALTHY" | "ATTENTION_REQUIRED" | "DISCONNECTED" | "AUTHENTICATION_ERROR" | "TOKEN_EXPIRED";

export interface GrantedGoogleService {
  id: GoogleWorkspaceService;
  label: string;
  granted: boolean;
}

export interface GoogleWorkspaceConnection {
  workspaceAccount?: string;
  workspaceDomain?: string;
  connectionStatus: GoogleWorkspaceConnectionStatus;
  connectedSince?: string;
  tokenStatus: GoogleWorkspaceTokenStatus;
  grantedServices: readonly GrantedGoogleService[];
  health: GoogleWorkspaceConnectionHealth;
  lastVerifiedAt?: string;
}

export interface GoogleWorkspaceAuthorizationRequest {
  authorizationCode: string;
  redirectUri: string;
  codeVerifier?: string;
}

export type GoogleWorkspaceProviderErrorCode = "AUTHENTICATION_FAILED" | "TOKEN_EXPIRED" | "INSUFFICIENT_SCOPE" | "NETWORK_ERROR" | "UNKNOWN";

export interface GoogleWorkspaceProviderError {
  code: GoogleWorkspaceProviderErrorCode;
  message: string;
  retryable: boolean;
}

export type GoogleWorkspaceConnectionResult =
  | { ok: true; connection: GoogleWorkspaceConnection }
  | { ok: false; connection: GoogleWorkspaceConnection; error: GoogleWorkspaceProviderError };

import type {
  GoogleWorkspaceAuthorizationRequest,
  GoogleWorkspaceProviderError,
  GoogleWorkspaceService,
} from "../types/google-workspace.types";

interface GoogleWorkspaceServerTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scopes: readonly string[];
}

export interface GoogleWorkspaceProviderSession {
  account: string;
  domain: string;
  connectedSince: string;
  grantedServices: readonly GoogleWorkspaceService[];
  tokens: GoogleWorkspaceServerTokens;
}

export type GoogleWorkspaceProviderResult =
  | { ok: true; session: GoogleWorkspaceProviderSession }
  | { ok: false; error: GoogleWorkspaceProviderError };

export interface GoogleWorkspaceVerificationResult {
  healthy: boolean;
  verifiedAt: string;
  error?: GoogleWorkspaceProviderError;
}

export interface GoogleWorkspaceProvider {
  connect(request: GoogleWorkspaceAuthorizationRequest): Promise<GoogleWorkspaceProviderResult>;
  reconnect(refreshToken: string): Promise<GoogleWorkspaceProviderResult>;
  disconnect(account: string): Promise<void>;
  verify(session: GoogleWorkspaceProviderSession): Promise<GoogleWorkspaceVerificationResult>;
  refresh(refreshToken: string): Promise<GoogleWorkspaceProviderResult>;
}

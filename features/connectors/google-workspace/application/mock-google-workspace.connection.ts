import type { GoogleWorkspaceConnection } from "../types/google-workspace.types";
import { GOOGLE_WORKSPACE_SERVICES, resolveConnectionHealth } from "./google-workspace.connector";

export const MOCK_GOOGLE_WORKSPACE_CONNECTION: GoogleWorkspaceConnection = {
  workspaceAccount: "admin@orbit.boom-box.cl",
  workspaceDomain: "boom-box.cl",
  connectionStatus: "CONNECTED",
  connectedSince: "5 agosto 2026 · 10:30",
  tokenStatus: "HEALTHY",
  grantedServices: GOOGLE_WORKSPACE_SERVICES.map((service) => ({ ...service, granted: true })),
  health: resolveConnectionHealth("CONNECTED", "HEALTHY"),
  lastVerifiedAt: "5 agosto 2026 · 16:40",
};

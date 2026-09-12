import { NextRequest, NextResponse } from "next/server";
import { disconnectGoogleWorkspace } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { getGoogleWorkspaceEnvironment } from "@/features/connectors/google-workspace/provider/google-workspace.config";
import { getGoogleWorkspaceAdministrator } from "@/features/connectors/google-workspace/application/google-workspace.authorization.guard";
import { usesNOVAGoogleCore } from "@/features/connectors/google-workspace/application/google-nova-core";

export async function POST(request: NextRequest) {
  const config = usesNOVAGoogleCore() ? { redirectUri: process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin } : getGoogleWorkspaceEnvironment();
  const expectedOrigin = new URL(config.redirectUri).origin;
  if (request.headers.get("origin") !== expectedOrigin) return new NextResponse("Forbidden", { status: 403 });
  const user = await getGoogleWorkspaceAdministrator();
  if (!user) return NextResponse.redirect(new URL("/login", config.redirectUri), 303);
  await disconnectGoogleWorkspace(user.id);
  return NextResponse.redirect(new URL("/settings?google=disconnected", config.redirectUri), 303);
}

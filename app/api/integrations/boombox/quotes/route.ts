import { acceptWebQuote } from "@/features/web-quotes/intake";
import { createWebQuoteStore } from "@/features/web-quotes/repository";
import { sendWebQuoteNotification } from "@/features/web-quotes/notification";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (process.env.BOOMBOX_WEB_QUOTE_ENABLED !== "true") return Response.json({ ok: false, code: "INTAKE_DISABLED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const isTest = process.env.VERCEL_ENV !== "production";
  return acceptWebQuote(request, {
    token: process.env.BOOMBOX_WEB_QUOTE_TOKEN, isTest,
    emailEnabled: process.env.BOOMBOX_WEB_QUOTE_EMAIL_ENABLED === "true",
    store: createWebQuoteStore(),
    notify: quote => sendWebQuoteNotification(quote, { isTest, loadToken: loadGoogleWorkspaceAccessToken }),
  });
}

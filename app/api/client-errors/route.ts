import { NextResponse } from "next/server";

const clean = (value: unknown, max = 500) =>
  String(value ?? "").replace(/[\r\n\t]/g, " ").slice(0, max);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    console.error(JSON.stringify({
      level: "error",
      event: "client.exception",
      fingerprint: clean(body.fingerprint, 120),
      message: clean(body.message),
      route: clean(body.route, 300),
      component: clean(body.component, 160),
      build: clean(body.build, 120),
      browser: clean(body.browser, 180),
      timestamp: new Date().toISOString(),
    }));
  } catch {
    // Telemetry must never affect the user-facing error state.
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}

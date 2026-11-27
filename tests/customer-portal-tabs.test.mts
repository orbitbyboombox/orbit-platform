import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const home = readFileSync("features/customer-portal/customer-portal-home.tsx", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");

test("customer portal uses one isolated active section for the six quick-access actions", () => {
  for (const label of ["Mi Evento", "Mi Contrato", "Mis Pagos", "Diseño de tira", "Datos bancarios", "Contacto BOOMBOX"]) {
    assert.match(home, new RegExp(label));
  }
  assert.match(home, /useState<PortalSection>\("event"\)/);
  assert.match(home, /role="tablist"/);
  assert.match(home, /role="tab"/);
  assert.match(home, /aria-selected=\{activeSection === section\}/);
});

test("customer portal renders content conditionally instead of mounting every panel", () => {
  for (const section of ["event", "contract", "payments", "design", "bank", "contact"]) {
    assert.match(home, new RegExp(`activeSection === "${section}"`));
  }
  assert.ok((home.match(/activeSection === /g) ?? []).length >= 6);
  assert.match(home, /activeSection === "contract" \? <CustomerContractExperience/);
  assert.match(home, /activeSection === "payments" \? <CustomerPaymentExperience/);
  assert.match(home, /activeSection === "bank" \? <BankTransferDetails\/>/);
  assert.match(home, /activeSection === "contact" \? <Panel id="contact"/);
});

test("retired customer portal demo and its descendants never bypass session enforcement", async () => {
  const demo = "/preview/customer-portal-demo";
  assert.equal(existsSync("app/preview/customer-portal-demo"), false);
  const checkedPaths: string[] = [];
  const sessionResponse = new Response(null, { status: 307 });
  const exports = {} as { middleware: (request: { nextUrl: URL }) => Promise<Response> };
  const { outputText } = ts.transpileModule(middleware, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  new Function("require", "exports", outputText)((name: string) => {
    switch (name) {
      case "next/server":
        return { NextResponse: { next: () => new Response() } };
      case "@/lib/supabase/middleware":
        return { updateSession: (request: { nextUrl: URL }) => {
          checkedPaths.push(request.nextUrl.pathname);
          return sessionResponse;
        } };
      default:
        throw new Error(`Unexpected module: ${name}`);
    }
  }, exports);
  const previous = process.env.VERCEL_ENV;
  try {
    for (const environment of ["preview", "production"]) {
      process.env.VERCEL_ENV = environment;
      for (const path of [demo, `${demo}/other`, `${demo}-lookalike`]) {
        assert.equal(await exports.middleware({ nextUrl: new URL(path, "https://orbit.example") }), sessionResponse);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
  assert.deepEqual(checkedPaths, [demo, `${demo}/other`, `${demo}-lookalike`, demo, `${demo}/other`, `${demo}-lookalike`]);
});

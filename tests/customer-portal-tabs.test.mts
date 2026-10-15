import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("features/customer-portal/customer-portal-home.tsx", "utf8");

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

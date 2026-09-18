import assert from "node:assert/strict";
import test from "node:test";
import { contractPdfFilename, isPdfContractCandidate, resolveContractPdfPath } from "../features/customer-portal/contract-pdf.ts";

test("contract download resolves the canonical PDF and ignores contract.json", () => {
  assert.equal(isPdfContractCandidate({ storage_path: "p/contract.json", mime_type: "application/json" }), false);
  assert.equal(resolveContractPdfPath("p/contract.json", [{ storage_path: "p/contract.json", mime_type: "application/json" }, { storage_path: "p/agreement-signed.pdf", mime_type: "application/pdf" }]), "p/agreement-signed.pdf");
  assert.equal(resolveContractPdfPath("p/contract.json", []), null);
});

test("contract PDF filename is safe and readable", () => {
  assert.equal(contractPdfFilename("Evento Corporativo Ñ 2026", "ORB-2026-1"), "CONTRATO_BOOMBOX_Evento_Corporativo_Ñ_2026.pdf");
});

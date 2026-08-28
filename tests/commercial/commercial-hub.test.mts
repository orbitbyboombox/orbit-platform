import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { calculateDiscount, calculateFormalQuote, isCommercialEmail } from "../../features/commercial-hub/quote-calculation.ts";
import { QUICK_SEND_CTA_FALLBACK, QUICK_SEND_CTA_LABEL, commercialGreeting, commercialSignatureMode, displayChileanPhone, documentCategoryLabel, emailParagraphs, formalQuoteSubject, formatChileanRutInput, hasUnresolvedCommercialVariables, inlineCommercialText, isQuickSendCtaParagraph, moneyInputNumber, normalizeEmailNewlines, quickSendBodyParagraphs, quickSendEditableBody, quoteDisplayFilename, quoteStorageKey, resolveQuickSendBody, titleCasePerson, withoutDuplicateSignature } from "../../features/commercial-hub/presentation.ts";
import { formatChileanRut, normalizeChileanMobileInput, normalizeChileanMobileLocal, normalizeChileanPhone } from "../../lib/chile/rut.ts";
import { activeCommercialDocument, catalogCategoryForQuickSend, catalogCategoryFromSlug, catalogPublicPath, catalogPublicUrl, pendingCommercialDocuments, validateCommercialUpload, validateSignatureUpload } from "../../features/commercial-hub/catalogs.ts";

const line = (patch: Record<string, unknown> = {}) => ({ id: "1", code: "CLASSIC", description: "Tótem Classic", quantity: 4, catalogPrice: 500000, quotedPrice: 430000, discountType: null, discountValue: 0, manual: false, ...patch });

test("quantity 1", () => assert.equal(calculateFormalQuote([line({ quantity: 1 })], null, 0, 50).subtotal, 430000));
test("quantity 4", () => assert.equal(calculateFormalQuote([line()], null, 0, 50).subtotal, 1720000));
test("quantity 10", () => assert.equal(calculateFormalQuote([line({ quantity: 10 })], null, 0, 50).subtotal, 4300000));
test("quantity 20", () => assert.equal(calculateFormalQuote([line({ quantity: 20 })], null, 0, 50).subtotal, 8600000));
test("invalid zero quantity is bounded to one", () => assert.equal(calculateFormalQuote([line({ quantity: 0 })], null, 0, 50).subtotal, 430000));
test("negative price is bounded to zero", () => assert.equal(calculateFormalQuote([line({ quotedPrice: -1 })], null, 0, 50).subtotal, 0));
test("catalog reference remains immutable", () => { const item = line(); calculateFormalQuote([item], null, 0, 50); assert.equal(item.catalogPrice, 500000); });
test("per quote override is used", () => assert.equal(calculateFormalQuote([line({ quantity: 2, quotedPrice: 420000 })], null, 0, 50).subtotal, 840000));
test("manual item", () => assert.equal(calculateFormalQuote([line({ manual: true, catalogPrice: null, quantity: 3, quotedPrice: 12345 })], null, 0, 50).subtotal, 37035));
test("multiline description does not affect totals", () => assert.equal(calculateFormalQuote([line({ description: "Uno\nDos", quantity: 1 })], null, 0, 50).subtotal, 430000));
test("line CLP discount", () => assert.equal(calculateFormalQuote([line({ quantity: 1, quotedPrice: 100000, discountType: "CLP", discountValue: 10000 })], null, 0, 50).subtotal, 90000));
test("line percentage discount", () => assert.equal(calculateFormalQuote([line({ quantity: 1, quotedPrice: 100000, discountType: "PERCENT", discountValue: 10 })], null, 0, 50).subtotal, 90000));
test("line percentage capped at 100", () => assert.equal(calculateDiscount(100000, "PERCENT", 120), 100000));
test("line CLP discount capped at gross", () => assert.equal(calculateDiscount(100000, "CLP", 120000), 100000));
test("negative discount is zero", () => assert.equal(calculateDiscount(100000, "CLP", -1), 0));
test("global CLP discount", () => assert.equal(calculateFormalQuote([line({ quantity: 1, quotedPrice: 100000 })], "CLP", 10000, 50).net, 90000));
test("global percentage discount", () => assert.equal(calculateFormalQuote([line({ quantity: 1, quotedPrice: 100000 })], "PERCENT", 10, 50).net, 90000));
test("IVA is applied exactly once to net", () => { const result = calculateFormalQuote([line({ quantity: 1, quotedPrice: 100000 })], null, 0, 50); assert.equal(result.vat, 19000); assert.equal(result.total, 119000); });
test("default deposit 50 percent", () => assert.equal(calculateFormalQuote([line({ quantity: 1, quotedPrice: 100000 })], null, 0, 50).deposit, 59500));
test("custom deposit 30 percent", () => assert.equal(calculateFormalQuote([line({ quantity: 1, quotedPrice: 100000 })], null, 0, 30).deposit, 35700));
test("deposit capped at 100", () => { const result = calculateFormalQuote([line({ quantity: 1, quotedPrice: 100000 })], null, 0, 150); assert.equal(result.deposit, result.total); });
test("balance equals total minus deposit", () => { const result = calculateFormalQuote([line({ quantity: 1, quotedPrice: 100000 })], null, 0, 40); assert.equal(result.balance, result.total - result.deposit); });
test("multiple lines sum", () => assert.equal(calculateFormalQuote([line({ quantity: 1, quotedPrice: 100 }), line({ id: "2", quantity: 2, quotedPrice: 200 })], null, 0, 50).subtotal, 500));
test("corporate scenario", () => { const result = calculateFormalQuote([line({ quantity: 4, quotedPrice: 450000 }), line({ id: "2", code: "BRANDING", quantity: 10, quotedPrice: 150000 }), line({ id: "3", code: "QR", quantity: 4, quotedPrice: 25000 }), line({ id: "4", code: "TRANSPORT", quantity: 1, quotedPrice: 50000 })], null, 0, 50); assert.equal(result.net, 3450000); assert.equal(result.vat, 655500); });
test("simple quote one line", () => assert.equal(calculateFormalQuote([line({ quantity: 1 })], null, 0, 50).lineTotals.length, 1));
test("complex quote ten lines", () => assert.equal(calculateFormalQuote(Array.from({ length: 10 }, (_, index) => line({ id: String(index), quantity: index + 1, quotedPrice: 1000 })), null, 0, 50).lineTotals.length, 10));
test("valid commercial email", () => assert.equal(isCommercialEmail("cliente@empresa.cl"), true));
test("email trims whitespace", () => assert.equal(isCommercialEmail(" cliente@empresa.cl "), true));
test("invalid commercial email", () => assert.equal(isCommercialEmail("cliente"), false));
test("storage key is ASCII and independent from display name", () => assert.equal(quoteStorageKey("uuid", "COTIZACIÓN 2026-000001"), "commercial/quotes/uuid/cotizacion-2026-000001.pdf"));
test("display filename preserves customer-facing Spanish", () => assert.equal(quoteDisplayFilename("COTIZACIÓN 2026-000001"), "Cotización BOOMBOX 2026-000001.pdf"));
test("escaped email newlines become real newlines", () => assert.equal(normalizeEmailNewlines("Hola\\n\\nEquipo"), "Hola\n\nEquipo"));
test("CRLF email newlines normalize", () => assert.equal(normalizeEmailNewlines("Hola\r\nEquipo"), "Hola\nEquipo"));
test("formal quote subject does not duplicate Cotización", () => assert.equal(formalQuoteSubject("COTIZACIÓN 2026-000001", "Empresa"), "Cotización BOOMBOX 2026-000001 — Empresa"));
test("formal quote subject supports optional customer", () => assert.equal(formalQuoteSubject("COTIZACIÓN 2026-000001"), "Cotización BOOMBOX 2026-000001"));
test("RUT formats during input", () => assert.equal(formatChileanRutInput("765652723"), "76.565.272-3"));
test("canonical RUT presentation accepts legacy representations", () => {
  assert.equal(formatChileanRut("904130001"), "90.413.000-1");
  assert.equal(formatChileanRut("765652723"), "76.565.272-3");
  assert.equal(formatChileanRut("12.345.678-k"), "12.345.678-K");
  assert.equal(formatChileanRut("90.413.0001"), "90.413.000-1");
  assert.equal(formatChileanRut(null), "");
  assert.equal(formatChileanRut(""), "");
});
test("quote create and edit use the canonical authenticated session RPC with explicit success text", () => {
  const actions = readFileSync(new URL("../../features/commercial-hub/actions.ts", import.meta.url), "utf8");
  const hub = readFileSync(new URL("../../features/commercial-hub/commercial-hub.tsx", import.meta.url), "utf8");
  assert.match(actions, /const \{ client, user \} = await founder\(\);/);
  assert.match(actions, /client\.rpc\(\s*"save_commercial_quote_draft"/);
  assert.doesNotMatch(actions, /admin\.rpc\(\s*"save_commercial_quote_draft"/);
  assert.match(hub, /Cotización actualizada correctamente/);
});
test("PDF viewer consumes close interactions before unmounting", () => {
  const viewer = readFileSync(new URL("../../components/documents/orbit-document-viewer.tsx", import.meta.url), "utf8");
  assert.match(viewer, /closeLock\.current/);
  assert.match(viewer, /createPortal\(/);
  assert.match(viewer, /document\.body/);
  assert.match(viewer, /event\.key === "Escape"/);
  assert.equal((viewer.match(/onClick=\{close\}/g) ?? []).length, 2);
  assert.match(viewer, /pointer-events-auto/);
});
test("Chile phone removes pasted prefix", () => assert.equal(normalizeChileanPhone("+56 9 6304 0989"), "56963040989"));
test("Chile phone preserves a valid leading nine in the editable eight digits", () => assert.equal(normalizeChileanMobileLocal("99690487"), "99690487"));
test("Chile phone default prefix leaves the eight editable digits empty", () => assert.equal(normalizeChileanMobileLocal("+569"), ""));
test("Chile phone typing does not duplicate the fixed mobile prefix", () => {
  assert.equal(normalizeChileanMobileInput("9"), "9");
  assert.equal(normalizeChileanMobileInput("96304098"), "56996304098");
  assert.equal(normalizeChileanMobileLocal("56996304098"), "96304098");
});
test("all Chile phone input formats resolve to one canonical value", () => {
  for (const value of ["+56999690487", "+56 9 9969 0487", "99690487"]) assert.equal(normalizeChileanPhone(value), "56999690487");
});
test("Chile phone displays canonical prefix", () => assert.equal(displayChileanPhone("+56963040989"), "+56 9 6304 0989"));
test("empty monetary draft normalizes to zero", () => assert.equal(moneyInputNumber(""), 0));
test("monetary paste strips separators", () => assert.equal(moneyInputNumber("$150.000"), 150000));
test("branding price edit does not retain leading zero", () => assert.equal(moneyInputNumber("150000"), 150000));
test("person visual title case", () => assert.equal(titleCasePerson("matias maira"), "Matias Maira"));
test("formal email creates real paragraphs", () => assert.deepEqual(emailParagraphs("Hola Matías,\n\nGracias por considerar a BOOMBOX.\n\nQuedamos atentos."), ["Hola Matías,", "Gracias por considerar a BOOMBOX.", "Quedamos atentos."]));
test("formal email greets the contact instead of company", () => assert.equal(commercialGreeting("matias maira"), "Hola Matias Maira,"));
test("formal email uses generic greeting without contact", () => assert.equal(commercialGreeting(""), "Hola,"));
test("email signature is not duplicated", () => assert.equal(withoutDuplicateSignature("Quedamos atentos.\n\nEquipo BOOMBOX", "Equipo BOOMBOX"), "Quedamos atentos."));
test("shared events catalog has Founder-facing category", () => assert.equal(documentCategoryLabel("EVENTS"), "Eventos / Cumpleaños / Graduaciones"));
test("public catalog paths are stable and category-owned", () => {
  assert.equal(catalogPublicPath("WEDDINGS"), "/catalogo/novios");
  assert.equal(catalogPublicPath("COMPANIES"), "/catalogo/empresas");
  assert.equal(catalogPublicPath("EVENTS"), "/catalogo/eventos");
});
test("public catalog URL is independent from document versions", () => {
  assert.equal(catalogPublicUrl("WEDDINGS"), "https://orbit.boom-box.cl/catalogo/novios");
  assert.equal(catalogPublicUrl("WEDDINGS"), catalogPublicUrl("WEDDINGS"));
});
test("catalog slugs resolve only to known canonical categories", () => {
  assert.equal(catalogCategoryFromSlug("novios"), "WEDDINGS");
  assert.equal(catalogCategoryFromSlug("empresas"), "COMPANIES");
  assert.equal(catalogCategoryFromSlug("eventos"), "EVENTS");
  assert.equal(catalogCategoryFromSlug("interno"), null);
});
test("catalog upload accepts a PDF larger than 20 MB", () => assert.equal(validateCommercialUpload({ mimeType: "application/pdf", size: 21 * 1024 * 1024 }), null));
test("catalog upload rejects files above 30 MB", () => assert.equal(validateCommercialUpload({ mimeType: "application/pdf", size: 31 * 1024 * 1024 }), "El PDF supera 30 MB."));
test("catalog upload rejects a non PDF", () => assert.equal(validateCommercialUpload({ mimeType: "image/png", size: 1024 }), "El documento debe ser PDF."));
test("graphical signature accepts every supported image format", () => {
  for (const mimeType of ["image/gif", "image/png", "image/jpeg", "image/webp"]) assert.equal(validateSignatureUpload({ mimeType, size: 1024 }), null);
});
test("graphical signature rejects unsupported formats", () => assert.equal(validateSignatureUpload({ mimeType: "image/svg+xml", size: 1024 }), "Usa GIF, PNG, JPG o WebP."));
test("quick-send greeting resolves a personal name", () => assert.match(resolveQuickSendBody("Hola [Nombre],\n\nBienvenido.", "matías"), /^Hola Matías,/));
test("quick-send greeting without name is friendly", () => assert.equal(resolveQuickSendBody("Hola [Nombre],\n\nBienvenido.", ""), "Hola,\n\nBienvenido."));
test("quick-send never exposes an unresolved name placeholder", () => assert.equal(hasUnresolvedCommercialVariables(resolveQuickSendBody("Hola [Nombre],", "")), false));
test("quick-send CTA marker is removed from body paragraphs", () => assert.deepEqual(quickSendBodyParagraphs(`Hola [Nombre],\n\n👉 **[${QUICK_SEND_CTA_LABEL}]**\n\nUn abrazo,`, "Matías"), ["Hola Matías,", "Un abrazo,"]));
test("quick-send CTA marker recognizes the official representation", () => assert.equal(isQuickSendCtaParagraph(`👉 **[${QUICK_SEND_CTA_LABEL}]**`), true));
test("quick-send CTA includes a compatible fallback message", () => assert.match(QUICK_SEND_CTA_FALLBACK, /botón no funciona/i));
test("weddings quick-send resolves to Novios catalog", () => assert.equal(catalogPublicPath("WEDDINGS"), "/catalogo/novios"));
test("birthdays quick-send resolves to Events catalog", () => assert.equal(catalogPublicPath("EVENTS"), "/catalogo/eventos"));
test("graduations quick-send resolves to Events catalog", () => assert.equal(catalogPublicPath("EVENTS"), "/catalogo/eventos"));
test("companies catalog architecture remains independent", () => assert.equal(catalogPublicPath("COMPANIES"), "/catalogo/empresas"));
test("quick-send categories use one canonical catalog mapping", () => {
  assert.equal(catalogCategoryForQuickSend("WEDDINGS"), "WEDDINGS");
  assert.equal(catalogCategoryForQuickSend("COMPANIES_CATALOG"), "COMPANIES");
  assert.equal(catalogCategoryForQuickSend("BIRTHDAYS"), "EVENTS");
  assert.equal(catalogCategoryForQuickSend("GRADUATIONS"), "EVENTS");
});
test("quick-send resolves only the ACTIVE canonical document", () => {
  const documents = [
    { id: "pending", category: "WEDDINGS", status: "PENDING" },
    { id: "active", category: "WEDDINGS", status: "ACTIVE" },
  ];
  assert.equal(activeCommercialDocument(documents, "WEDDINGS")?.id, "active");
  assert.deepEqual(pendingCommercialDocuments(documents, "WEDDINGS").map((item) => item.id), ["pending"]);
});
test("clean quick-send editor hides the technical CTA marker", () => {
  const clean = quickSendEditableBody(`Hola [Nombre],\n\n👉 **[${QUICK_SEND_CTA_LABEL}]**\n\n**BOOMBOX**`);
  assert.equal(clean, "Hola [Nombre],\n\n**BOOMBOX**");
  assert.deepEqual(inlineCommercialText("**BOOMBOX** oficial"), [{ text: "BOOMBOX", strong: true }, { text: " oficial", strong: false }]);
});
test("catalog activation invalidates Hub and all stable public routes", () => {
  const source = readFileSync(new URL("../../features/commercial-hub/settings.actions.ts", import.meta.url), "utf8");
  for (const path of ["/leads", "/catalogo/novios", "/catalogo/empresas", "/catalogo/eventos"])
    assert.match(source, new RegExp(`revalidatePath\\(\\"${path.replaceAll("/", "\\/")}\\"\\)`));
});
test("public catalog routes resolve the canonical ACTIVE row", () => {
  const page = readFileSync(new URL("../../app/catalogo/[slug]/page.tsx", import.meta.url), "utf8");
  const repository = readFileSync(new URL("../../features/commercial-hub/catalog-repository.ts", import.meta.url), "utf8");
  assert.match(page, /catalogCategoryFromSlug\(slug\)/);
  assert.match(page, /loadActiveCommercialDocument\(category\)/);
  assert.match(repository, /\.eq\("status", "ACTIVE"\)/);
});
test("canonical download route streams the ACTIVE PDF without a relative URL", () => {
  const route = readFileSync(new URL("../../app/catalogo/[slug]/document/route.ts", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../../app/catalogo/[slug]/catalog-actions.tsx", import.meta.url), "utf8");
  assert.match(route, /loadActiveCommercialDocument\(category\)/);
  assert.match(route, /createSignedUrl/);
  assert.match(route, /download \? \{ download: document\.filename \}/);
  assert.match(actions, /`\/catalogo\/\$\{encodeURIComponent\(slug\)\}\/document\?download=1`/);
  assert.doesNotMatch(actions, /href="document\?download=1"/);
});
test("public reader renders the canonical document progressively", () => {
  const reader = readFileSync(new URL("../../app/catalogo/[slug]/continuous-pdf-reader.tsx", import.meta.url), "utf8");
  assert.match(reader, /document\.numPages/);
  assert.match(reader, /IntersectionObserver/);
  assert.match(reader, /rootMargin: "900px 0px"/);
  assert.match(reader, /Cargando catálogo/);
  assert.match(reader, /Reintentar/);
});
test("public catalog share uses Web Share with clipboard fallback", () => {
  const actions = readFileSync(new URL("../../app/catalogo/[slug]/catalog-actions.tsx", import.meta.url), "utf8");
  assert.match(actions, /navigator\.share/);
  assert.match(actions, /navigator\.clipboard\.writeText/);
});
test("public catalog surface contains no administrative navigation", () => {
  const page = readFileSync(new URL("../../app/catalogo/[slug]/page.tsx", import.meta.url), "utf8");
  for (const internal of ["Founder", "Configuración", "Clientes", "Navegación principal"])
    assert.doesNotMatch(page, new RegExp(internal));
});
test("graphical signature suppresses textual fallback", () => assert.equal(commercialSignatureMode("https://example.com/signature.gif"), "GRAPHICAL"));
test("missing graphical signature uses Team BOOMBOX fallback", () => assert.equal(commercialSignatureMode(""), "FALLBACK"));
test("official template migration preserves Founder customizations", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/0123_official_quick_send_templates.sql", import.meta.url), "utf8");
  assert.match(migration, /template\.subject is not distinct from template\.default_subject/);
  assert.match(migration, /template\.body is not distinct from template\.default_body/);
  assert.doesNotMatch(migration, /COMPANIES_CATALOG/);
});

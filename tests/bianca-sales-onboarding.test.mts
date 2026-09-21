import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { catalogAssistanceResponse } from "../features/connectors/whatsapp-cloud/bianca-sales-onboarding.ts";

const responderPath = new URL("../features/connectors/whatsapp-cloud/whatsapp-ai.responder.ts", import.meta.url);
const processorPath = new URL("../features/connectors/whatsapp-cloud/whatsapp-orbit.processor.ts", import.meta.url);

test("catalog response is contextual, warm, and keeps the conversation open", () => {
  const response = catalogAssistanceResponse({
    name: "Andrés",
    eventType: "Matrimonio",
    sourceRef: "https://orbit.boom-box.cl/catalogo/novios",
  });
  assert.match(response, /Encantada, Andrés/);
  assert.match(response, /catálogo de matrimonio/);
  assert.match(response, /https:\/\/orbit\.boom-box\.cl\/catalogo\/novios/);
  assert.match(response, /dudas sobre algún servicio|recomiende/);
  assert.doesNotMatch(response, /^Sí 😊 Te dejo nuestro catálogo:/);
});

test("onboarding gates commercial catalog behind confirmed identity when needed", async () => {
  const source = await readFile(responderPath, "utf8");
  assert.match(source, /eventTypeJustCaptured/);
  assert.match(source, /firstContactNeedsName/);
  assert.match(source, /!preferredNameConfirmed/);
  assert.match(source, /eventTypeCatalogCategory/);
  assert.match(source, /nameJustConfirmed/);
  assert.match(source, /decision\.requestedAction = "CATALOG_LOOKUP"/);
});

test("availability can proceed without interrupting onboarding for a name", async () => {
  const source = await readFile(responderPath, "utf8");
  assert.match(source, /!availabilityTurn/);
  assert.match(source, /const availabilityTurn/);
});

test("catalog delivery records the post-catalog assistance state", async () => {
  const source = await readFile(processorPath, "utf8");
  assert.match(source, /catalogAssistanceResponse/);
  assert.match(source, /CATALOG_SHARED_AWAITING_GUIDANCE/);
  assert.match(source, /decision\.requestedAction === "CATALOG_LOOKUP"/);
});

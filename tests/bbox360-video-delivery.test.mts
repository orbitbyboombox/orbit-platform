import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderBbox360VideoDeliveryHtml, validateBbox360VideoDeliveryUrl } from "../features/connectors/google-gmail/application/bbox360-video-delivery.template.ts";

const service = () => readFile(new URL("../features/connectors/google-gmail/application/bbox360-video-delivery.service.ts", import.meta.url), "utf8");
const workspace = () => readFile(new URL("../features/projects/components/project-workspace-experience.tsx", import.meta.url), "utf8");

test("BBOX 360 video links require HTTPS and the renderer preserves the customer URL", () => {
  assert.equal(validateBbox360VideoDeliveryUrl("https://drive.google.com/file/video"), "https://drive.google.com/file/video");
  assert.throws(() => validateBbox360VideoDeliveryUrl("http://example.com/video"));
  assert.throws(() => validateBbox360VideoDeliveryUrl("javascript:alert(1)"));
  const html = renderBbox360VideoDeliveryHtml("Cliente & Demo", "2026-10-21", "https://example.com/video?a=1&b=2");
  assert.match(html, /Videos BBOX 360/);
  assert.match(html, /https:\/\/example\.com\/video\?a=1&amp;b=2/);
  assert.match(html, /VER VIDEOS BBOX 360/);
});

test("BBOX 360 is available for all events and the communication type is independent", async () => {
  const source = await service();
  assert.doesNotMatch(source, /service_code === "BBOX360"/);
  assert.doesNotMatch(source, /project_services\(service_code\)/);
  assert.match(source, /BBOX360_VIDEO_DELIVERY/);
  assert.match(source, /bbox360_video_delivery_url/);
  assert.doesNotMatch(source, /DIGITAL_PHOTO_DELIVERY/);
});

test("workspace renders the independent card after Fotos digitales without automatic sending", async () => {
  const source = await workspace();
  assert.match(source, /Bbox360VideoDeliveryControl/);
  assert.ok(source.indexOf("DigitalPhotoDeliveryControl") < source.indexOf("Bbox360VideoDeliveryControl"));
  assert.match(source, /activeTab === "COMMUNICATIONS"/);
});

test("first send requires an explicit confirmation and presents recipient and CC", async () => {
  const source = await readFile(new URL("../features/projects/communications/bbox360-video-delivery-control.tsx", import.meta.url), "utf8");
  assert.match(source, /setConfirming\(composer\.hasSuccessfulSend \? "resend" : "first"\)/);
  assert.match(source, /Se enviará a <strong>\{composer\.to\}<\/strong>/);
  assert.match(source, /onClick=\{\(\) => setConfirming\(false\)\}/);
  assert.match(source, /onClick=\{\(\) => deliver\(true\)\}/);
});

test("confirmation sends confirmResend=true and keeps the stable request id for idempotency", async () => {
  const source = await readFile(new URL("../features/projects/communications/bbox360-video-delivery-control.tsx", import.meta.url), "utf8");
  const service = await readFile(new URL("../features/connectors/google-gmail/application/bbox360-video-delivery.service.ts", import.meta.url), "utf8");
  assert.match(source, /data\.set\("confirmResend", String\(confirmed\)\)/);
  assert.match(source, /data\.set\("requestId", requestId \|\| crypto\.randomUUID\(\)\)/);
  assert.match(source, /submissionGate\.current = true/);
  assert.match(service, /communication_type.*communicationType/);
  assert.match(service, /BBOX360_VIDEO_DELIVERY/);
});

test("Videos BBOX 360 follows the Fotos digitales card structure without touching its module", async () => {
  const component = await readFile(new URL("../features/projects/communications/bbox360-video-delivery-control.tsx", import.meta.url), "utf8");
  const photo = await readFile(new URL("../features/projects/communications/digital-photo-delivery-control.tsx", import.meta.url), "utf8");
  assert.match(component, /MobileDialog/);
  assert.match(component, /VISTA PREVIA DEL CORREO/);
  assert.match(component, /VER HISTORIAL/);
  assert.match(component, /rounded-2xl border bg-card p-5 sm:p-6/);
  assert.doesNotMatch(component, /DIGITAL_PHOTO_DELIVERY/);
  assert.match(photo, /data-digital-photo-delivery/);
});

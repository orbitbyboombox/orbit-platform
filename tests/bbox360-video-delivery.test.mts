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

test("BBOX 360 eligibility is canonical and the communication type is independent", async () => {
  const source = await service();
  assert.match(source, /service_code === "BBOX360"/);
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

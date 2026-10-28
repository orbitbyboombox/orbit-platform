export const EVENT_DIGITAL_PHOTO_TEMPLATE_TYPE = "EVENT_DIGITAL_PHOTO_TEMPLATE";

const safeName = (value: string) => value.trim().normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-100) || "template";

export function eventDigitalPhotoTemplateDriveFileName(input: { orbitEventId: string; version: number; originalFilename: string }) {
  return `TEMPLATE_DIGITAL_V${input.version}_${safeName(input.orbitEventId)}_${safeName(input.originalFilename)}`;
}

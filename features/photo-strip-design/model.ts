export const PHOTO_STRIP_DESIGN_TYPE = "PHOTO_STRIP_DESIGN";

const safeName = (value: string) =>
  value.trim().normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-100) || "diseno";

export function photoStripDriveFileName(input: {
  orbitEventId: string;
  version: number;
  originalFilename: string;
}) {
  return `TIRA_FOTOS_V${input.version}_${safeName(input.orbitEventId)}_${safeName(input.originalFilename)}`;
}

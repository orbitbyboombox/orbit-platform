/**
 * Nombres de presentación oficiales de BOOMBOX (es-CL).
 *
 * Estos nombres son exclusivamente visuales. Los códigos y valores persistidos
 * de reservas, catálogos, pagos y asignaciones NO deben transformarse.
 */
const SERVICE_LABELS: Readonly<Record<string, string>> = {
  CLASSIC: "Cabina Classic",
  POLAROID: "Cabina Polaroid",
  BLACK_STUDIO: "Cabina Black Studio",
  BLACKSTUDIO: "Cabina Black Studio",
  BBOX360: "Plataforma 360°",
  LIGHTBOX: "Aro de luz",
  HASHTAG: "Cabina Hashtag",
  IMANES: "Fotos con imanes",
  BOOMBALL: "Boomball",
  INSTABOX: "Cabina Instabox",
  VIDEO_LOUNGE: "Video Lounge",
  SCRAPBOOK: "Libro de recuerdos (SCRAPBOOK)",
};

const SERVICE_ALIASES: Readonly<Record<string, string>> = {
  "BLACK STUDIO": "BLACK_STUDIO",
  "BOOM BALL": "BOOMBALL",
  "VIDEO LOUNGE": "VIDEO_LOUNGE",
  "ARO DE LUZ": "LIGHTBOX",
  "FOTOS CON IMANES": "IMANES",
  "CABINA CLASSIC": "CLASSIC",
  "CABINA POLAROID": "POLAROID",
  "CABINA BLACK STUDIO": "BLACK_STUDIO",
  "CABINA HASHTAG": "HASHTAG",
  "CABINA INSTABOX": "INSTABOX",
  "PLATAFORMA 360°": "BBOX360",
  "LIBRO DE RECUERDOS (SCRAPBOOK)": "SCRAPBOOK",
};

/** Mapea un nombre o código de servicio a su etiqueta visible; no muta datos. */
export function serviceDisplayName(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLocaleUpperCase("es-CL").replace(/[-\s]+/g, "_");
  const alias = SERVICE_ALIASES[trimmed.toLocaleUpperCase("es-CL")] ?? normalized;
  return SERVICE_LABELS[alias] ?? trimmed;
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  OPERATOR: "Operador",
  SUPERVISOR: "Supervisor",
  ASSEMBLY: "Montaje",
  DISASSEMBLY: "Desmontaje",
  ASSEMBLY_DISASSEMBLY: "Montaje y desmontaje",
};

/** Etiquetas de funciones; una persona puede tener más de una función. */
export function staffRoleDisplayName(value: string): string {
  return ROLE_LABELS[value.trim().toUpperCase()] ?? value.trim();
}

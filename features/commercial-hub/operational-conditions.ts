export interface QuoteOperationalCondition {
  label: string;
  text: string;
}

export const DEFAULT_QUOTE_OPERATIONAL_CONDITIONS: QuoteOperationalCondition[] =
  [
    {
      label: "Montaje y desmontaje",
      text: "BOOMBOX requiere acceso al recinto con anticipación suficiente para realizar el montaje, instalación y pruebas necesarias antes del inicio del servicio.",
    },
    {
      label: "Acceso",
      text: "El cliente, productor u organización responsable deberá facilitar el ingreso y retiro del equipamiento, incluyendo accesos habilitados, coordinación con seguridad y ascensores de carga cuando corresponda.",
    },
    {
      label: "Energía",
      text: "Se requiere acceso a un enchufe 220V directo, operativo y próximo al área donde será instalada la experiencia.",
    },
    {
      label: "Carga, descarga y estacionamiento",
      text: "El recinto deberá permitir condiciones razonables para la carga y descarga del equipamiento y acceso de los vehículos operacionales.",
    },
    {
      label: "Edificios / estacionamientos subterráneos",
      text: "El cliente deberá informar previamente restricciones de altura. Algunos vehículos operacionales BOOMBOX pueden requerir accesos de hasta 2,30 m de altura.",
    },
    {
      label: "Espacio de instalación",
      text: "El espacio definido para BOOMBOX deberá encontrarse disponible, despejado y accesible al momento del montaje.",
    },
    {
      label: "Cambios operacionales",
      text: "Los cambios de ubicación, horarios, accesos u otras condiciones relevantes deberán informarse previamente para permitir una correcta coordinación operacional.",
    },
  ];

export function normalizeQuoteOperationalConditions(
  value: unknown,
): QuoteOperationalCondition[] {
  if (!Array.isArray(value)) return DEFAULT_QUOTE_OPERATIONAL_CONDITIONS;
  const conditions = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const text = typeof record.text === "string" ? record.text.trim() : "";
    return label && text ? [{ label, text }] : [];
  });
  return conditions.length ? conditions : DEFAULT_QUOTE_OPERATIONAL_CONDITIONS;
}

export function formatQuoteOperationalConditions(value: unknown) {
  return normalizeQuoteOperationalConditions(value)
    .map(({ label, text }) => `${label}: ${text}`)
    .join("\n\n");
}

export function parseQuoteOperationalConditions(
  value: string,
): QuoteOperationalCondition[] {
  const entries = value
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.length)
    throw new Error("Las condiciones operacionales no pueden quedar vacías.");
  return entries.map((entry) => {
    const separator = entry.indexOf(":");
    if (separator < 1)
      throw new Error(
        "Cada condición operacional debe usar el formato “Título: descripción”.",
      );
    const label = entry.slice(0, separator).trim();
    const text = entry
      .slice(separator + 1)
      .replace(/\s+/g, " ")
      .trim();
    if (!label || !text)
      throw new Error(
        "Cada condición operacional requiere título y descripción.",
      );
    return { label, text };
  });
}

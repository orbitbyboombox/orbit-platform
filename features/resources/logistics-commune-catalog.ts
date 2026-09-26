export const LOGISTICS_SECTORS = ["NORTE", "ORIENTE", "CENTRO", "PONIENTE", "SUR", "OTROS"] as const;
export type LogisticsSector = (typeof LOGISTICS_SECTORS)[number];

export type CommuneSectorMapping = {
  commune: string;
  province: string;
  region: "REGION_METROPOLITANA";
  sector: LogisticsSector;
  source: "PERSISTED" | "DEFAULT";
};

export const REGION_METROPOLITANA_COMMUNE_CATALOG = [
  ["Alhué", "Melipilla"], ["Buin", "Maipo"], ["Calera de Tango", "Maipo"], ["Cerrillos", "Santiago"],
  ["Cerro Navia", "Santiago"], ["Colina", "Chacabuco"], ["Conchalí", "Santiago"], ["Curacaví", "Melipilla"],
  ["El Bosque", "Santiago"], ["El Monte", "Talagante"], ["Estación Central", "Santiago"], ["Huechuraba", "Santiago"],
  ["Independencia", "Santiago"], ["Isla de Maipo", "Talagante"], ["La Cisterna", "Santiago"], ["La Florida", "Santiago"],
  ["La Granja", "Santiago"], ["La Pintana", "Santiago"], ["La Reina", "Santiago"], ["Lampa", "Chacabuco"],
  ["Las Condes", "Santiago"], ["Lo Barnechea", "Santiago"], ["Lo Espejo", "Santiago"], ["Lo Prado", "Santiago"],
  ["Macul", "Santiago"], ["Maipú", "Santiago"], ["María Pinto", "Melipilla"], ["Melipilla", "Melipilla"], ["Ñuñoa", "Santiago"],
  ["Padre Hurtado", "Talagante"], ["Paine", "Maipo"], ["Pedro Aguirre Cerda", "Santiago"], ["Peñaflor", "Talagante"],
  ["Peñalolén", "Santiago"], ["Pirque", "Cordillera"], ["Providencia", "Santiago"], ["Pudahuel", "Santiago"],
  ["Puente Alto", "Cordillera"], ["Quilicura", "Santiago"], ["Quinta Normal", "Santiago"], ["Recoleta", "Santiago"],
  ["Renca", "Santiago"], ["San Bernardo", "Maipo"], ["San Joaquín", "Santiago"], ["San José de Maipo", "Cordillera"],
  ["San Miguel", "Santiago"], ["San Pedro", "Melipilla"], ["San Ramón", "Santiago"], ["Santiago", "Santiago"],
  ["Talagante", "Talagante"], ["Tiltil", "Chacabuco"], ["Vitacura", "Santiago"],
] as const;

export const DEFAULT_COMMUNE_SECTOR_MAP: Record<string, LogisticsSector> = {
  Colina: "NORTE", Lampa: "NORTE", Tiltil: "NORTE",
  "Las Condes": "ORIENTE", Vitacura: "ORIENTE", "Lo Barnechea": "ORIENTE", "La Reina": "ORIENTE",
  Santiago: "CENTRO", Providencia: "CENTRO", Ñuñoa: "CENTRO",
  Pudahuel: "PONIENTE", Maipú: "PONIENTE", Cerrillos: "PONIENTE",
  "La Florida": "SUR", "Puente Alto": "SUR", "San Bernardo": "SUR",
};

const removeAccents = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const aliases: Record<string, string> = { chicureo: "colina", "til til": "tiltil" };

export const normalizeCommune = (value: string) => {
  const key = removeAccents(value).trim().toLocaleLowerCase("es-CL").replace(/\s+/g, " ");
  return aliases[key] ?? key;
};

export const canonicalCommuneName = (value: string) => REGION_METROPOLITANA_COMMUNE_CATALOG.find(([name]) => normalizeCommune(name) === normalizeCommune(value))?.[0] ?? value.trim();
export const defaultSectorForCommune = (value: string): LogisticsSector => {
  const canonical = canonicalCommuneName(value);
  return DEFAULT_COMMUNE_SECTOR_MAP[canonical] ?? "OTROS";
};
export const isLogisticsSector = (value: unknown): value is LogisticsSector => typeof value === "string" && (LOGISTICS_SECTORS as readonly string[]).includes(value);


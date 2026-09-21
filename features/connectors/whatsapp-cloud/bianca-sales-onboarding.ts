export type BiancaCatalogCategory = "WEDDINGS" | "EVENTS" | "COMPANIES";

export function eventTypeCatalogCategory(eventType?: string): BiancaCatalogCategory {
  const normalized = eventType?.toLocaleLowerCase("es-CL").normalize("NFD").replace(/[\u0300-\u036f]/g, "") ?? "";
  if (/matrimonio|novio|boda/.test(normalized)) return "WEDDINGS";
  if (/empresa|corporativ|activacion|congreso|feria|lanzamiento/.test(normalized)) return "COMPANIES";
  return "EVENTS";
}

export function catalogAssistanceResponse(input: { name?: string; eventType?: string; sourceRef: string }) {
  const name = input.name?.trim();
  const eventLabel = input.eventType?.trim().toLocaleLowerCase("es-CL");
  const subject = eventLabel ? ` de ${eventLabel}` : "";
  const opening = name ? `Encantada, ${name} 😊` : "¡Perfecto! 😊";
  return `${opening} Te dejo nuestro catálogo${subject} para que puedas revisar nuestras experiencias y valores:\n\n${input.sourceRef}\n\nRevísalo con calma. Si tienes dudas sobre algún servicio, diferencias entre opciones o quieres que te recomiende cuál puede funcionar mejor, estaré atenta para ayudarte.`;
}

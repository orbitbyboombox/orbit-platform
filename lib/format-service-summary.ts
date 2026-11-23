import { serviceDisplayName } from "./orbit-display-labels.ts";

/** Resumen visible en español; mantiene códigos y registros originales intactos. */
export function formatServiceSummary(services: readonly string[], duration = "3 horas") {
  return services.map((service) => {
    const label = serviceDisplayName(service);
    return label === "Cabina Classic" ? `${label} • ${duration}` : label;
  }).join(" + ");
}

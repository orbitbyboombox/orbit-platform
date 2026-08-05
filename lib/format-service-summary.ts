export function formatServiceSummary(services: readonly string[], duration = "3 horas") {
  return services.map((service) => service === "Classic" ? `Classic • ${duration}` : service).join(" + ");
}

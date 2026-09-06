import "server-only";
import { JsonConsoleLogger } from "@/services/structured-logger.service";

const logger = new JsonConsoleLogger();

export function logWhatsApp(
  level: "info" | "warn" | "error",
  event: string,
  correlationId: string,
  metadata?: Readonly<Record<string, unknown>>,
) {
  logger.write({ level, event, correlationId, timestamp: new Date().toISOString(), metadata });
}

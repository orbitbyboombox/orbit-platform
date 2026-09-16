import "server-only";
import { JsonConsoleLogger } from "@/services/structured-logger.service";

const logger = new JsonConsoleLogger();

export function serializeWhatsAppError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error);
  try {
    return JSON.stringify(error, (_key, value) => value instanceof Error ? { name: value.name, message: value.message } : value);
  } catch {
    return "Unknown WhatsApp error";
  }
}

export function logWhatsApp(
  level: "info" | "warn" | "error",
  event: string,
  correlationId: string,
  metadata?: Readonly<Record<string, unknown>>,
) {
  logger.write({ level, event, correlationId, timestamp: new Date().toISOString(), metadata });
}

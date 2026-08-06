export type LogLevel = "debug" | "info" | "warn" | "error";
export interface StructuredLog { level: LogLevel; event: string; correlationId: string; timestamp: string; aggregateId?: string; metadata?: Readonly<Record<string, unknown>>; error?: Readonly<Record<string, unknown>>; }
export interface StructuredLogger { write(entry: StructuredLog): void; }

export class JsonConsoleLogger implements StructuredLogger {
  write(entry: StructuredLog): void {
    const serialized = JSON.stringify(entry);
    if (entry.level === "error") console.error(serialized);
    else if (entry.level === "warn") console.warn(serialized);
    else console.info(serialized);
  }
}

import type { LucideIcon } from "lucide-react";

export type ConnectionStatus =
  | "NOT_CONNECTED"
  | "CONFIGURED"
  | "CONNECTED"
  | "ERROR";

export interface ConnectionService {
  readonly id: string;
  readonly name: string;
}

export interface ConnectionProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly initialStatus: ConnectionStatus;
  readonly services: readonly ConnectionService[];
}

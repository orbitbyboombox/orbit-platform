import type { AuditMetadata } from "./audit";

export type PersistableEntityName =
  | "Customer"
  | "Project"
  | "Timeline"
  | "Assignment"
  | "CalendarSync"
  | "DriveSync"
  | "Expense"
  | "Supply"
  | "Profit"
  | "Staff"
  | "CustomerMemory"
  | "Communication"
  | "ConversationState"
  | "Agreement"
  | "Document"
  | "ConnectorJob";

export interface PersistableEntity<TId extends string = string> extends AuditMetadata {
  id: TId;
  version: number;
}

export interface PersistenceResult<TEntity> {
  entity: TEntity;
  version: number;
}

export interface PersistenceRepository<TEntity extends PersistableEntity> {
  findById(id: TEntity["id"]): Promise<TEntity | null>;
  save(entity: TEntity, expectedVersion?: number): Promise<PersistenceResult<TEntity>>;
}

export interface AppendOnlyEventRepository<TEvent> {
  append(event: Readonly<TEvent>): Promise<void>;
  findByEntityId(entityId: string): Promise<readonly TEvent[]>;
}

export type EntityPersistenceContract<TEntity extends PersistableEntity = PersistableEntity> = {
  readonly entity: PersistableEntityName;
  readonly repository: PersistenceRepository<TEntity>;
};

export type PersistenceContractRegistry = Readonly<Record<PersistableEntityName, EntityPersistenceContract>>;

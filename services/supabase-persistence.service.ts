import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersistableEntity, PersistenceRepository, PersistenceResult } from "@/types/persistence";

export type ProductionTable =
  | "customers" | "projects" | "staff" | "assignments" | "customer_memory"
  | "supplies" | "expenses" | "calendar_sync" | "drive_sync"
  | "conversation_states" | "agreements" | "connector_jobs";

export class PersistenceConflictError extends Error {
  constructor(readonly entityId: string, readonly expectedVersion: number) {
    super(`Persistence conflict for ${entityId} at version ${expectedVersion}.`);
    this.name = "PersistenceConflictError";
  }
}
export class SupabaseVersionedRepository<TEntity extends PersistableEntity>
  implements PersistenceRepository<TEntity> {
  constructor(private readonly client: SupabaseClient, private readonly table: ProductionTable) {}

  async findById(id: TEntity["id"]): Promise<TEntity | null> {
    const { data, error } = await this.client.from(this.table).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    return data as TEntity | null;
  }

  async save(entity: TEntity, expectedVersion?: number): Promise<PersistenceResult<TEntity>> {
    if (expectedVersion === undefined) {
      const { data, error } = await this.client.from(this.table).insert(entity).select("*").single();
      if (error) throw error;
      const saved = data as TEntity;
      return { entity: saved, version: saved.version };
    }
    const { data, error } = await this.client.from(this.table).update(entity).eq("id", entity.id).eq("version", expectedVersion).is("deleted_at", null).select("*").maybeSingle();
    if (error) throw error;
    if (!data) throw new PersistenceConflictError(entity.id, expectedVersion);
    const saved = data as TEntity;
    return { entity: saved, version: saved.version };
  }

  async softDelete(id: TEntity["id"], expectedVersion: number, actorId: string): Promise<void> {
    const { data, error } = await this.client.from(this.table).update({ deleted_at: new Date().toISOString(), deleted_by: actorId }).eq("id", id).eq("version", expectedVersion).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new PersistenceConflictError(id, expectedVersion);
  }
}

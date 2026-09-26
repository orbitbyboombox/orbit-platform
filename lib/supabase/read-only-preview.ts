import type { SupabaseClient } from "@supabase/supabase-js";

const blockedDatabaseMethods = new Set(["insert", "upsert", "update", "delete"]);
const blockedStorageMethods = new Set(["upload", "update", "remove", "move", "copy"]);
const readOnlyError = () => {
  throw new Error("READ_ONLY_VISUAL_PREVIEW: mutation blocked.");
};

function readOnlyBuilder<T extends object>(builder: T): T {
  return new Proxy(builder, {
    get(target, property, receiver) {
      if (typeof property === "string" && blockedDatabaseMethods.has(property)) return readOnlyError;
      return Reflect.get(target, property, receiver);
    },
  });
}

function readOnlyStorage<T extends object>(storage: T): T {
  return new Proxy(storage, {
    get(target, property, receiver) {
      if (property === "from") {
        return (bucket: string) => readOnlyStorage((target as { from: (name: string) => object }).from(bucket));
      }
      if (typeof property === "string" && blockedStorageMethods.has(property)) return readOnlyError;
      return Reflect.get(target, property, receiver);
    },
  });
}

/**
 * Preview-only defense in depth. Authentication and SELECTs remain available;
 * database writes, RPCs, storage writes, and Edge Function invocations fail closed.
 */
export function makeReadOnlyVisualPreviewClient<T extends SupabaseClient>(client: T): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "from") {
        return (table: string) => readOnlyBuilder((target as SupabaseClient).from(table));
      }
      if (property === "rpc" || property === "functions") return readOnlyError;
      if (property === "storage") return readOnlyStorage((target as SupabaseClient).storage);
      if (property === "auth") {
        const auth = (target as SupabaseClient).auth;
        return new Proxy(auth, {
          get(authTarget, authProperty, authReceiver) {
            if (authProperty === "admin") return readOnlyError;
            return Reflect.get(authTarget, authProperty, authReceiver);
          },
        });
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

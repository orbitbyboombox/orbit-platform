import test from "node:test";
import assert from "node:assert/strict";
import { MemoryOrbitLocalStore, OrbitSyncQueueManager, OrbitSyncTestHarness } from "@orbitnova/resilient-sync";

const operation = (manager: OrbitSyncQueueManager, resourceType: "CLIENT" | "QUOTE_DRAFT" | "EVENT_DRAFT", key: string) =>
  manager.enqueue({ resourceType, action: "CREATE", resourceLocalId: `00000000-0000-4000-8000-${key.slice(-12).padStart(12, "0")}`, payload: { name: key }, idempotencyKey: `qa:${key}` });

test("isolated offline harness covers queue persistence, reconnect, idempotency and degraded modes", async () => {
  const transport = new OrbitSyncTestHarness();
  const store = new MemoryOrbitLocalStore("00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000f1");
  const manager = new OrbitSyncQueueManager("00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000f1", store, transport);
  manager.setConnectionState(false, "NO_INTERNET");
  await operation(manager, "CLIENT", "QA-SYNC-CLIENT-BOOMBOX");
  await operation(manager, "QUOTE_DRAFT", "QA-SYNC-QUOTE-BOOMBOX");
  await operation(manager, "EVENT_DRAFT", "QA-SYNC-EVENT-DRAFT-BOOMBOX");
  assert.equal((await manager.getStatus()).pending, 3);
  assert.equal((await store.listOperations(["PENDING"])).length, 3);
  manager.setConnectionState(true, "ONLINE");
  assert.equal((await manager.syncNow()).pending, 0);
  assert.equal(transport.received.length, 1);
  assert.equal(transport.appliedIdempotencyKeys.size, 3);
  assert.equal((await manager.syncNow()).pending, 0);
  assert.equal(transport.appliedIdempotencyKeys.size, 3);
  transport.setFault("GOOGLE_ERROR");
  await operation(manager, "QUOTE_DRAFT", "QA-GOOGLE-DEGRADED");
  const google = await manager.syncNow();
  assert.equal(google.errors, 1);
  transport.setFault("EMAIL_ERROR");
  await operation(manager, "QUOTE_DRAFT", "QA-EMAIL-DEGRADED");
  const email = await manager.syncNow();
  assert.equal(email.errors, 2);
  transport.setFault("NONE");
  assert.equal((await manager.retryErrors()).pending, 0);
  await store.clearUserData();
  assert.equal((await store.listOperations()).length, 0);
});

test("harness isolates tenants and requires review on same-field conflicts", async () => {
  const a = new OrbitSyncQueueManager("00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2", new MemoryOrbitLocalStore("00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2"), new OrbitSyncTestHarness());
  const b = new OrbitSyncQueueManager("00000000-0000-4000-8000-0000000000b1", "00000000-0000-4000-8000-0000000000b2", new MemoryOrbitLocalStore("00000000-0000-4000-8000-0000000000b1", "00000000-0000-4000-8000-0000000000b2"), new OrbitSyncTestHarness());
  a.setConnectionState(false, "NO_INTERNET");
  b.setConnectionState(false, "NO_INTERNET");
  await a.enqueue({ resourceType: "CLIENT", resourceServerId: "00000000-0000-4000-8000-000000000001", action: "UPDATE", payload: { field: "A" }, baseVersion: 1, idempotencyKey: "qa:tenant-a" });
  await b.enqueue({ resourceType: "CLIENT", resourceServerId: "00000000-0000-4000-8000-000000000001", action: "UPDATE", payload: { field: "B" }, baseVersion: 1, idempotencyKey: "qa:tenant-b" });
  assert.equal((await a.getStatus()).pending, 1);
  assert.equal((await b.getStatus()).pending, 1);
  assert.notEqual(a.organizationId, b.organizationId);
  assert.notEqual(a.actorUserId, b.actorUserId);
  const conflictTransport = new OrbitSyncTestHarness();
  conflictTransport.setFault("CONFLICT");
  const conflict = new OrbitSyncQueueManager("00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2", new MemoryOrbitLocalStore("00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2"), conflictTransport);
  conflict.setConnectionState(false, "NO_INTERNET");
  await conflict.enqueue({ resourceType: "CLIENT", resourceServerId: "00000000-0000-4000-8000-000000000001", action: "UPDATE", payload: { field: "A" }, baseVersion: 1, idempotencyKey: "qa:conflict-test" });
  conflict.setConnectionState(true, "ONLINE");
  assert.equal((await conflict.syncNow()).conflicts, 1);
});

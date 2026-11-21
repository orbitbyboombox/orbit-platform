import assert from "node:assert/strict";
import test from "node:test";
import { GoogleDriveLive } from "../features/connectors/google-drive/application/google-drive-live.ts";
import { InMemoryGoogleDriveFolderRepository } from "../features/connectors/google-drive/repository/google-drive-folder.repository.ts";

const workspace = {
  connectionStatus: "CONNECTED",
  health: "HEALTHY",
  grantedServices: [{ id: "DRIVE", granted: true }],
} as ConstructorParameters<typeof GoogleDriveLive>[0];

const plan = [
  { name: "BOOMBOX ORBIT", path: "BOOMBOX ORBIT", parentPath: null },
  { name: "2026", path: "BOOMBOX ORBIT/2026", parentPath: "BOOMBOX ORBIT" },
];

test("rejects a missing cached Drive folder ID instead of silently marking it updated", async () => {
  const repository = new InMemoryGoogleDriveFolderRepository();
  await repository.save({ ...plan[0], driveFolderId: "root-id", status: "UPDATED", lastUpdatedAt: "2026-11-19" });
  await repository.save({ ...plan[1], status: "UPDATED", lastUpdatedAt: "2026-11-19" });
  const provider = {
    getFolderParents: async () => ["root-id"],
    createFolder: async () => { throw new Error("must not create"); },
  } as unknown as ConstructorParameters<typeof GoogleDriveLive>[1];
  const result = await new GoogleDriveLive(workspace, provider, repository).synchronizeFolderPlan(plan, "2026-11-19");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, /DRIVE_FOLDER_ID_MISSING/);
});

test("rejects a cached folder that has moved to an unexpected parent", async () => {
  const repository = new InMemoryGoogleDriveFolderRepository();
  await repository.save({ ...plan[0], driveFolderId: "root-id", status: "UPDATED", lastUpdatedAt: "2026-11-19" });
  await repository.save({ ...plan[1], driveFolderId: "year-id", status: "UPDATED", lastUpdatedAt: "2026-11-19" });
  const provider = {
    getFolderParents: async (id: string) => id === "year-id" ? ["other-root"] : [],
    createFolder: async () => { throw new Error("must not create"); },
  } as unknown as ConstructorParameters<typeof GoogleDriveLive>[1];
  const result = await new GoogleDriveLive(workspace, provider, repository).synchronizeFolderPlan(plan, "2026-11-19");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, /DRIVE_PARENT_MISMATCH/);
});

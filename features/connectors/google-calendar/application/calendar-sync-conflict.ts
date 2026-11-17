export function hasRemoteCalendarConflict(lastSynchronization: string | undefined, remoteUpdatedAt: string | undefined): boolean {
  if (!lastSynchronization || !remoteUpdatedAt) return true;
  const lastSyncTime = Date.parse(lastSynchronization);
  const remoteUpdateTime = Date.parse(remoteUpdatedAt);
  if (!Number.isFinite(lastSyncTime) || !Number.isFinite(remoteUpdateTime)) return true;
  return remoteUpdateTime > lastSyncTime;
}

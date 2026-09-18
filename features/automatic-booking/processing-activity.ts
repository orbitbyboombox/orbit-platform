export type ProcessingActivityTick = (elapsedSeconds: number) => void;

export function formatElapsedSeconds(elapsedSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** A real-time UI ticker only. It never advances booking stages or performs I/O. */
export function createProcessingActivityTicker(onTick: ProcessingActivityTick, now: () => number = Date.now) {
  const startedAt = now();
  onTick(0);
  const timer = setInterval(() => onTick(Math.floor((now() - startedAt) / 1000)), 1000);
  return () => clearInterval(timer);
}

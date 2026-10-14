/** Updates the elapsed-time indicator during the booking confirmation flow. */
export function createProcessingActivityTicker(onTick: (seconds: number) => void): () => void {
  const startedAt = Date.now();
  onTick(0);
  const timer = setInterval(() => onTick(Math.floor((Date.now() - startedAt) / 1000)), 1000);
  return () => clearInterval(timer);
}

export function formatElapsedSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}

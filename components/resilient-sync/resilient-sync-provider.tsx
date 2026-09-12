"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildSyncAreas,
  installOrbitResilientSync,
  mergeNonCollidingChanges,
  registerOrbitSyncServiceWorker,
  type BlobRecord,
  type JsonObject,
  type OfflineResourceType,
  type OperationAction,
  type OperationBatchResult,
  type OperationEnvelope,
  type SyncArea,
  type SyncStatusSnapshot,
} from "@orbitnova/resilient-sync";

type Runtime = ReturnType<typeof installOrbitResilientSync>;
type QueueInput = {
  resourceType: OfflineResourceType;
  resourceLocalId?: string;
  resourceServerId?: string | null;
  action: OperationAction;
  payload: JsonObject;
  baseVersion?: number | null;
  baseSnapshot?: JsonObject | null;
  idempotencyKey?: string;
};

type ContextValue = {
  enabled: boolean;
  online: boolean;
  snapshot: SyncStatusSnapshot;
  totalPending: number;
  areas: SyncArea[];
  operations: OperationEnvelope[];
  files: BlobRecord[];
  enqueue(input: QueueInput): Promise<OperationEnvelope>;
  queueFile(input: { operationId: string; filename: string; mimeType: string; blob: Blob }): Promise<void>;
  syncNow(): Promise<void>;
  retryErrors(): Promise<void>;
  openCenter(): void;
};

const EMPTY: SyncStatusSnapshot = {
  status: "SYNCED",
  pending: 0,
  syncing: 0,
  errors: 0,
  conflicts: 0,
  blocked: 0,
  synced: 0,
  degradedReason: "ONLINE",
};

const SyncContext = createContext<ContextValue | null>(null);
const pendingOperation = (operation: OperationEnvelope) => operation.sync_status !== "SYNCED";
const pendingFile = (file: BlobRecord) => file.upload_status !== "UPLOADED";
const safeLabel: Record<string, string> = {
  CLIENT: "Cliente",
  QUOTE_DRAFT: "Cotización",
  RESERVATION_DRAFT: "Borrador de reserva",
  EVENT_DRAFT: "Borrador de evento",
  EXPENSE: "Gasto",
  NOTE: "Nota",
  LOGISTICS_NOTE: "Nota operacional",
};

export function ResilientSyncProvider({
  children,
  enabled,
  organizationId,
  userId,
}: {
  children: ReactNode;
  enabled: boolean;
  organizationId: string;
  userId: string;
}) {
  const runtime = useRef<Runtime | null>(null);
  const onlineRef = useRef(true);
  const syncingRef = useRef(false);
  const [online, setOnline] = useState(true);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [operations, setOperations] = useState<OperationEnvelope[]>([]);
  const [files, setFiles] = useState<BlobRecord[]>([]);
  const [areas, setAreas] = useState<SyncArea[]>([]);
  const [open, setOpen] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    if (!runtime.current) return;
    const [nextSnapshot, localOperations, localFiles, remote] = await Promise.all([
      runtime.current.status(),
      runtime.current.listOperations(),
      runtime.current.listFiles(),
      navigator.onLine
        ? fetch("/api/resilient-sync/status", { cache: "no-store" })
            .then(async (response) => response.ok ? response.json() : null)
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    const operationMap = new Map<string, OperationEnvelope | { resource_type: string; sync_status: string }>();
    for (const operation of localOperations.filter(pendingOperation)) operationMap.set(operation.operation_id, operation);
    for (const operation of remote?.operations ?? []) {
      const key = String(operation.operation_id ?? `remote:${operation.resource_type}:${operation.queued_at ?? operationMap.size}`);
      operationMap.set(key, operation);
    }
    const jobs = Array.isArray(remote?.external_jobs) ? remote.external_jobs : [];
    const combinedOperations = [...operationMap.values()];
    const localFilesPending = localFiles.filter(pendingFile);
    const externalPending = jobs.filter((job: { status?: string }) => job.status !== "SUCCESS").length;
    const totalPending = combinedOperations.length + localFilesPending.length + externalPending;
    const conflicts = combinedOperations.filter((item) => item.sync_status === "CONFLICT").length;
    const blocked = combinedOperations.filter((item) => item.sync_status === "BLOCKED").length;
    const errors = combinedOperations.filter((item) => item.sync_status === "ERROR").length;
    const nextStatus: SyncStatusSnapshot["status"] = !navigator.onLine
      ? "OFFLINE"
      : syncingRef.current
        ? "SYNCING"
        : conflicts + blocked + errors > 0
          ? "ATTENTION"
          : totalPending > 0
            ? "PENDING"
            : "SYNCED";
    const googleProblem = jobs.some((job: { job_type?: string; status?: string }) =>
      /DRIVE|CALENDAR/.test(String(job.job_type)) && /FAILED|BLOCKED_AUTH|RETRYING/.test(String(job.status)));
    const emailProblem = jobs.some((job: { job_type?: string; status?: string }) =>
      job.job_type === "EMAIL_SEND" && /FAILED|BLOCKED_AUTH|RETRYING/.test(String(job.status)));
    setSnapshot({
      ...nextSnapshot,
      status: nextStatus,
      pending: totalPending,
      errors,
      conflicts,
      blocked,
      degradedReason: !navigator.onLine ? "NO_INTERNET" : googleProblem ? "GOOGLE_DOWN" : emailProblem ? "EMAIL_DOWN" : nextSnapshot.degradedReason,
    });
    setOperations(localOperations);
    setFiles(localFiles);
    const projected = buildSyncAreas(combinedOperations, jobs);
    if (localFilesPending.length) {
      const documents = projected.find((area) => area.key === "documents");
      if (documents) {
        documents.state = "PENDIENTE";
        documents.pending = (documents.pending ?? 0) + localFilesPending.length;
        documents.detail = `${localFilesPending.length} archivo(s) seguros en este dispositivo`;
      }
    }
    setAreas(projected);
  }, []);

  useEffect(() => {
    if (!enabled || !organizationId || !userId) return;
    let cancelled = false;
    const updateProgress = (current: number, total: number) => {
      if (!cancelled) setProgress({ current, total });
    };
    const installed = installOrbitResilientSync({
      organizationId,
      userId,
      resources: ["CLIENT", "QUOTE_DRAFT", "RESERVATION_DRAFT", "EVENT_DRAFT", "EXPENSE", "NOTE", "LOGISTICS_NOTE"],
      autoSync: false,
      adapters: {
        transport: {
          async send(batch) {
            const results: OperationBatchResult[] = [];
            updateProgress(0, batch.length);
            for (const operation of batch) {
              const response = await fetch("/api/resilient-sync/batch", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ operations: [operation] }),
              });
              if (response.status === 401) {
                results.push({
                  operation_id: operation.operation_id,
                  idempotency_key: operation.idempotency_key,
                  status: "BLOCKED",
                  error_code: "AUTH_EXPIRED",
                });
              } else {
                if (!response.ok) throw new Error("SYNC_TRANSPORT_FAILED");
                const body = await response.json();
                results.push(...(body.results ?? []));
              }
              updateProgress(results.length, batch.length);
            }
            return results;
          },
        },
        fileUpload: {
          async upload(record) {
            const data = new FormData();
            data.set("blobId", record.blob_id);
            data.set("operationId", record.operation_id);
            data.set("file", record.blob, record.filename);
            const response = await fetch("/api/resilient-sync/files", { method: "POST", body: data });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || !body.serverReference) throw new Error(body.error ?? "FILE_UPLOAD_FAILED");
            return { serverReference: body.serverReference };
          },
        },
      },
    });
    runtime.current = installed;
    const onConnection = () => {
      const wasOffline = !onlineRef.current;
      const nextOnline = navigator.onLine;
      onlineRef.current = nextOnline;
      setOnline(nextOnline);
      installed.manager.setConnectionState(nextOnline, nextOnline ? "ONLINE" : "NO_INTERNET");
      if (wasOffline && nextOnline) {
        setReconnected(true);
        void installed.status().then((state) => {
          if (state.conflicts + state.blocked === 0) void installed.syncNow().finally(refresh);
        });
      }
      void refresh();
    };
    const onServiceWorkerSync = (event: MessageEvent) => {
      if (event.data?.type === "ORBIT_SYNC_REQUESTED") void installed.syncNow().finally(refresh);
    };
    onlineRef.current = navigator.onLine;
    setOnline(navigator.onLine);
    window.addEventListener("online", onConnection);
    window.addEventListener("offline", onConnection);
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerSync);
    void registerOrbitSyncServiceWorker().catch(() => null);
    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onConnection);
      window.removeEventListener("offline", onConnection);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerSync);
      installed.destroy();
      runtime.current = null;
    };
  }, [enabled, organizationId, refresh, userId]);

  const enqueue = useCallback(async (input: QueueInput) => {
    if (!runtime.current) throw new Error("RESILIENT_SYNC_NOT_READY");
    const operation = await runtime.current.enqueue(input);
    await refresh();
    return operation;
  }, [refresh]);

  const queueFile = useCallback(async (input: { operationId: string; filename: string; mimeType: string; blob: Blob }) => {
    if (!runtime.current?.queueFile) throw new Error("FILE_QUEUE_NOT_READY");
    await runtime.current.queueFile(input);
    await refresh();
  }, [refresh]);

  const syncNow = useCallback(async () => {
    if (!runtime.current || syncing) return;
    syncingRef.current = true;
    setSyncing(true);
    setProgress({ current: 0, total: operations.filter(pendingOperation).length });
    try {
      await runtime.current.syncNow();
      await runtime.current.syncFiles?.();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [operations, refresh, syncing]);

  const retryErrors = useCallback(async () => {
    if (!runtime.current || syncing) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await runtime.current.retryErrors();
      await fetch("/api/resilient-sync/jobs/retry", { method: "POST" }).catch(() => null);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [refresh, syncing]);

  const value = useMemo<ContextValue>(() => ({
    enabled,
    online,
    snapshot,
    totalPending: snapshot.pending,
    areas,
    operations,
    files,
    enqueue,
    queueFile,
    syncNow,
    retryErrors,
    openCenter: () => setOpen(true),
  }), [areas, enabled, enqueue, files, online, operations, queueFile, retryErrors, snapshot, syncNow]);

  return (
    <SyncContext.Provider value={value}>
      {children}
      {reconnected && snapshot.pending > 0 ? (
        <div className="orbit-sync-reconnect" role="status">
          <span>Conexión recuperada. Tienes {snapshot.pending} elementos pendientes.</span>
          <button type="button" onClick={() => { setReconnected(false); setOpen(true); }}>SINCRONIZAR AHORA</button>
        </div>
      ) : null}
      {open ? (
        <div className="orbit-sync-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section aria-labelledby="orbit-sync-title" className="orbit-sync-center" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><small>ORBIT RESILIENT SYNC</small><h2 id="orbit-sync-title">CENTRO DE SINCRONIZACIÓN</h2></div>
              <button aria-label="Cerrar Centro de Sincronización" type="button" onClick={() => setOpen(false)}>×</button>
            </header>
            <div className="orbit-sync-total"><strong>{snapshot.pending}</strong><span>TOTAL PENDIENTES</span></div>
            {syncing && progress.total > 0 ? (
              <div className="orbit-sync-progress" aria-live="polite">
                <p>Sincronizando {Math.min(progress.current + 1, progress.total)} de {progress.total}</p>
                <div><span style={{ width: `${Math.round(progress.current / progress.total * 100)}%` }} /></div>
              </div>
            ) : null}
            <div className="orbit-sync-areas">
              {areas.map((area) => <div key={area.key}><span>{area.label}{area.pending ? ` · ${area.pending}` : ""}</span><strong data-state={area.state}>{area.state.replaceAll("_", " ")}</strong>{area.detail ? <small>{area.detail}</small> : null}</div>)}
            </div>
            <div className="orbit-sync-items">
              {operations.filter(pendingOperation).map((operation) => (
                <article key={operation.operation_id}>
                  <div><strong>{safeLabel[operation.resource_type] ?? operation.resource_type}</strong><span>{new Date(operation.queued_at).toLocaleString("es-CL")} · intento {operation.retry_count + 1}</span></div>
                  <span>{operation.sync_status === "CONFLICT" ? "REQUIERE REVISIÓN" : operation.sync_status}</span>
                  {operation.last_error_code ? <small>{operation.last_error_code}</small> : null}
                  {operation.sync_status === "CONFLICT" ? (
                    <div className="orbit-sync-conflict">
                      <p>Este registro cambió mientras estabas sin conexión.</p>
                      <button type="button" onClick={async () => { await runtime.current?.manager.resolveConflict(operation.operation_id, "SERVER"); await refresh(); }}>MANTENER ORBIT</button>
                      <button type="button" onClick={async () => {
                        const server = operation.server_snapshot ?? {};
                        const base = operation.base_snapshot ?? {};
                        const merged = mergeNonCollidingChanges(base, operation.payload, server);
                        if (!merged.autoMerged) return;
                        await runtime.current?.manager.resolveConflict(operation.operation_id, "LOCAL", merged.merged, operation.base_version ?? 0);
                        await refresh();
                      }}>USAR CAMBIO LOCAL</button>
                    </div>
                  ) : null}
                </article>
              ))}
              {files.filter(pendingFile).map((file) => <article key={file.blob_id}><div><strong>Archivo · {file.filename}</strong><span>{Math.ceil(file.size / 1024)} KB · intento {file.retry_count + 1}</span></div><span>{file.upload_status}</span></article>)}
              {snapshot.pending === 0 ? <p className="orbit-sync-empty">SINCRONIZACIÓN COMPLETA</p> : null}
            </div>
            <footer>
              {snapshot.errors > 0 ? <button type="button" onClick={retryErrors} disabled={syncing}>REINTENTAR FALLIDOS</button> : null}
              <button type="button" onClick={syncNow} disabled={syncing || !online || snapshot.pending === 0}>
                {syncing ? "SINCRONIZANDO…" : `SINCRONIZAR AHORA · ${snapshot.pending}`}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </SyncContext.Provider>
  );
}

export function useResilientSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useResilientSync must run inside ResilientSyncProvider");
  return value;
}

export function ResilientSyncIndicator() {
  const sync = useResilientSync();
  const label = !sync.online
    ? `OFFLINE · ${sync.totalPending} pendientes`
    : sync.snapshot.status === "SYNCING"
      ? "SYNCING"
      : sync.snapshot.degradedReason === "GOOGLE_DOWN"
        ? "GOOGLE DEGRADED"
        : sync.snapshot.degradedReason === "EMAIL_DOWN"
          ? "EMAIL DEGRADED"
          : sync.totalPending > 0
            ? `ONLINE · ${sync.totalPending} pendientes`
            : "SINCRONIZADO";
  return (
    <button
      className="orbit-sync-indicator"
      data-state={sync.snapshot.status}
      onClick={sync.openCenter}
      type="button"
      aria-label={sync.totalPending > 0 ? `Abrir Centro de Sincronización, ${sync.totalPending} pendientes` : "Abrir Centro de Sincronización"}
    >
      <i aria-hidden="true" />
      <span>{label}</span>
      {sync.totalPending > 0 ? <b>SINCRONIZAR AHORA · {sync.totalPending}</b> : null}
    </button>
  );
}

const DB_NAME = "betterworld-offline";
const STORE_NAME = "observations";
const DB_VERSION = 1;

export interface QueuedObservation {
  id: string;
  data: {
    observationType: string;
    caption: string;
    gpsLat: number;
    gpsLng: number;
    gpsAccuracyMeters?: number;
    capturedAt?: string;
    problemTitle?: string;
    domain?: string;
    severity?: string;
  };
  photos: Blob[];
  createdAt: number;
  retryCount: number;
  lastRetryAt: number | null;
  status: "queued" | "uploading" | "failed";
}

/** Maximum number of retry attempts before giving up */
export const MAX_RETRIES = 10;

/** Maximum backoff interval in milliseconds (5 minutes) */
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** Calculate exponential backoff delay for a given retry count */
export function calculateBackoff(retryCount: number): number {
  return Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF_MS);
}

/** Check whether a retry is allowed based on timing and retry count */
export function shouldRetry(obs: Pick<QueuedObservation, "retryCount" | "lastRetryAt">): boolean {
  if (obs.retryCount >= MAX_RETRIES) return false;
  if (obs.lastRetryAt) {
    const backoffMs = calculateBackoff(obs.retryCount);
    if (Date.now() - obs.lastRetryAt < backoffMs) return false;
  }
  return true;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueObservation(
  observation: QueuedObservation["data"],
  photos: Blob[] = [],
): Promise<string> {
  const db = await openDb();
  const id = crypto.randomUUID();
  const entry: QueuedObservation = {
    id,
    data: observation,
    photos,
    createdAt: Date.now(),
    retryCount: 0,
    lastRetryAt: null,
    status: "queued",
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => {
      // Register background sync if available
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        navigator.serviceWorker.ready.then((reg) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (reg as any).sync.register("sync-observations");
        });
      }
      resolve(id);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingObservations(): Promise<QueuedObservation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeObservation(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateObservation(obs: QueuedObservation): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(obs);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function syncQueuedObservations(
  apiBaseUrl: string,
  authToken: string,
): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingObservations();
  let synced = 0;
  let failed = 0;

  for (const obs of pending.sort((a, b) => a.createdAt - b.createdAt)) {
    if (!shouldRetry(obs)) {
      if (obs.retryCount >= MAX_RETRIES) {
        // T069: Remove permanently failed observations from IndexedDB
        // and emit a user-visible notification
        await removeObservation(obs.id);
        failed++;

        // Emit notification event for UI to display
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("bw-offline-permanent-failure", {
              detail: {
                observationId: obs.id,
                retryCount: obs.retryCount,
                message: `Observation failed after ${obs.retryCount} retries and has been removed from the queue.`,
              },
            }),
          );
        }
      }
      continue;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/observations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(obs.data),
      });

      if (response.ok) {
        await removeObservation(obs.id);
        synced++;
      } else {
        await updateObservation({
          ...obs,
          retryCount: obs.retryCount + 1,
          lastRetryAt: Date.now(),
          status: "failed" as const,
        });
        failed++;
      }
    } catch {
      await updateObservation({
        ...obs,
        retryCount: obs.retryCount + 1,
        lastRetryAt: Date.now(),
        status: "failed" as const,
      });
      failed++;
    }
  }

  return { synced, failed };
}

export async function getQueueCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

import type { DataSourceMode, VehiclePosition } from "../../domain/types";

type PersistedRealtimeVehiclesRecord = {
  cacheKey: string;
  mode: DataSourceMode;
  lineId: string;
  directionId: string | null;
  anchorStopId: string | null;
  vehicles: VehiclePosition[];
  updatedAt: string;
  cachedAt: number;
};

type PersistedRealtimeVehicles = {
  vehicles: VehiclePosition[];
  updatedAt: string;
};

const DATABASE_NAME = "tuutuut-storage";
const DATABASE_VERSION = 1;
const STORE_NAME = "realtime-vehicles";
const MAX_CACHE_AGE_MS = 10 * 60 * 1000;

let databasePromise: Promise<IDBDatabase | null> | null = null;

function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    };
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    };

    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    };
  });
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) {
    return null;
  }

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: "cacheKey"
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Unable to open IndexedDB."));
    };
  }).catch(() => null);

  return databasePromise;
}

function isFresh(record: PersistedRealtimeVehiclesRecord): boolean {
  return Date.now() - record.cachedAt <= MAX_CACHE_AGE_MS;
}

export function buildRealtimeVehiclesCacheKey(
  mode: DataSourceMode,
  lineId: string,
  directionId?: string,
  anchorStopId?: string
): string {
  return `${mode}::${lineId}::${directionId ?? "default"}::${anchorStopId ?? "default-stop"}`;
}

export async function readPersistedRealtimeVehicles(
  cacheKey: string
): Promise<PersistedRealtimeVehicles | null> {
  const database = await openDatabase();

  if (!database) {
    return null;
  }

  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const record = await requestToPromise(
      store.get(cacheKey) as IDBRequest<PersistedRealtimeVehiclesRecord | undefined>
    );

    if (!record) {
      return null;
    }

    if (!isFresh(record)) {
      void deletePersistedRealtimeVehicles(cacheKey);
      return null;
    }

    return {
      vehicles: record.vehicles,
      updatedAt: record.updatedAt
    };
  } catch {
    return null;
  }
}

export async function writePersistedRealtimeVehicles(record: {
  cacheKey: string;
  mode: DataSourceMode;
  lineId: string;
  directionId: string | undefined;
  anchorStopId: string | undefined;
  vehicles: VehiclePosition[];
  updatedAt: string;
}): Promise<void> {
  const database = await openDatabase();

  if (!database) {
    return;
  }

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    store.put({
      cacheKey: record.cacheKey,
      mode: record.mode,
      lineId: record.lineId,
      directionId: record.directionId ?? null,
      anchorStopId: record.anchorStopId ?? null,
      vehicles: record.vehicles,
      updatedAt: record.updatedAt,
      cachedAt: Date.now()
    } satisfies PersistedRealtimeVehiclesRecord);

    await transactionToPromise(transaction);
  } catch {
    // Le cache persistant est un bonus ; on ignore les erreurs de stockage.
  }
}

export async function deletePersistedRealtimeVehicles(cacheKey: string): Promise<void> {
  const database = await openDatabase();

  if (!database) {
    return;
  }

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(cacheKey);
    await transactionToPromise(transaction);
  } catch {
    // Rien à faire ici non plus.
  }
}

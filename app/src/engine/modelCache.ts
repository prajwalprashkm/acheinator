import type { Meta } from "./types";

const DB = "acheinator";
const STORE = "model";
const SCHEMA = 1;

export interface CachedModel {
  schema: number;
  key: string;
  meta: Meta;
  stats: ArrayBuffer;
  model: ArrayBuffer;
}

/** Bust cache when export shape or ONNX I/O names change. */
export function modelCacheKey(meta: Meta): string {
  const { input, output } = meta.network;
  return `${meta.nSymptoms}:${meta.nDiseases}:${input}:${output}:${meta.trainedWithoutYes}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
        req.onsuccess = () => resolve(req.result);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error ?? new Error("indexedDB transaction failed"));
      }),
  );
}

export async function readCachedModel(key: string): Promise<CachedModel | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const row = await withStore("readonly", (s) => s.get(key));
    if (!row || typeof row !== "object") return null;
    const c = row as CachedModel;
    if (c.schema !== SCHEMA || c.key !== key) return null;
    return c;
  } catch {
    return null;
  }
}

export async function writeCachedModel(entry: CachedModel): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await withStore("readwrite", (s) => s.put(entry, entry.key));
  } catch {
    /* private mode / quota — still playable without cache */
  }
}
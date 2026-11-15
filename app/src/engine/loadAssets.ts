import { modelCacheKey, readCachedModel, writeCachedModel } from "./modelCache";
import type { EngineData, Meta } from "./types";

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** When the host omits Content-Length (common on static hosts), infer progress from this. */
const MODEL_BYTES_HINT = 14_535_798;

type ProgressFn = (fraction: number) => void;

let assetsOnce: Promise<Assets> | null = null;
const progressSubs = new Set<ProgressFn>();

function notifyProgress(f: number) {
  const v = Math.min(1, Math.max(0, f));
  for (const fn of progressSubs) fn(v);
}

/** Single in-flight load (avoids duplicate downloads when React remounts the hook). */
export function loadAssetsOnce(onProgress?: ProgressFn): Promise<Assets> {
  if (onProgress) progressSubs.add(onProgress);
  if (!assetsOnce) {
    assetsOnce = loadAssets((f) => notifyProgress(f)).finally(() => {
      assetsOnce = null;
    });
  }
  return assetsOnce;
}

export function releaseLoadProgress(onProgress: ProgressFn) {
  progressSubs.delete(onProgress);
}

/** Fetches a file, reporting bytes received so far (total may be 0 if the server doesn't say). */
async function fetchBytes(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || !onProgress) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Splits stats.bin into P(symptom | disease) and P(disease). */
export function parseStats(meta: Meta, bytes: Uint8Array): Pick<EngineData, "pSymGivenDis" | "pDis"> {
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const n = meta.nDiseases * meta.nSymptoms;
  if (floats.length !== n + meta.nDiseases) throw new Error("stats.bin doesn't match meta.json; re-run export_web_assets.py");
  return { pSymGivenDis: floats.slice(0, n), pDis: floats.slice(n) };
}

export interface Assets {
  data: EngineData;
  modelBytes: Uint8Array;
}

/** onProgress gets a 0..1 fraction of the model download, which is nearly all of the bytes. */
export async function loadAssets(onProgress?: (fraction: number) => void): Promise<Assets> {
  const dir = `${BASE_PATH}/model`;
  const meta = await fetch(`${dir}/meta.json`).then((r) => {
    if (!r.ok) throw new Error(`Couldn't load meta.json (${r.status})`);
    return r.json() as Promise<Meta>;
  });

  const cacheKey = modelCacheKey(meta);
  const cached = await readCachedModel(cacheKey);
  if (cached) {
    onProgress?.(1);
    const stats = new Uint8Array(cached.stats);
    const modelBytes = new Uint8Array(cached.model);
    return { data: { meta, ...parseStats(meta, stats) }, modelBytes };
  }

  onProgress?.(0.02);
  const [stats, modelBytes] = await Promise.all([
    fetchBytes(`${dir}/stats.bin`),
    fetchBytes(`${dir}/model.onnx`, (loaded, total) => {
      const denom = total > 0 ? total : MODEL_BYTES_HINT;
      onProgress?.(Math.min(0.98, loaded / denom));
    }),
  ]);
  onProgress?.(0.99);

  const statsCopy = stats.slice();
  const modelCopy = modelBytes.slice();
  void writeCachedModel({
    schema: 1,
    key: cacheKey,
    meta,
    stats: statsCopy.buffer.slice(statsCopy.byteOffset, statsCopy.byteOffset + statsCopy.byteLength),
    model: modelCopy.buffer.slice(modelCopy.byteOffset, modelCopy.byteOffset + modelCopy.byteLength),
  });

  return { data: { meta, ...parseStats(meta, stats) }, modelBytes };
}

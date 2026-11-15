import type { NetworkFn } from "./types";

/**
 * Creates the network from model bytes using onnxruntime-web (browser, WASM backend).
 * The bundler ships onnxruntime's .wasm file under /_next/static, so it is self-hosted
 * and picks up the basePath automatically.
 */
export async function createBrowserNetwork(modelBytes: Uint8Array, inputName: string, outputName: string): Promise<NetworkFn> {
  const ort = await import("onnxruntime-web/wasm");
  // GitHub Pages can't send the headers multi-threading needs.
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"] });
  return async (input, batch) => {
    const tensor = new ort.Tensor("float32", input, [batch, input.length / batch]);
    const out = await session.run({ [inputName]: tensor });
    return out[outputName].data as Float32Array;
  };
}

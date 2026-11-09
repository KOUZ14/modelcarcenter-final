import { readFile } from "node:fs/promises";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: "data:text/javascript,export const env = {};", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".wasm")) {
    const data = (await readFile(new URL(url))).toString("base64");
    return { format: "module", shortCircuit: true, source: `export default await WebAssembly.compile(Uint8Array.from(Buffer.from(${JSON.stringify(data)},'base64')));` };
  }
  return nextLoad(url, context);
}

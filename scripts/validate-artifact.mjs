import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [workerPath, hostingPath] = process.argv.slice(2);
if (!workerPath || !hostingPath) {
  throw new Error("Usage: validate-artifact.mjs <worker> <hosting-manifest>");
}

JSON.parse(await readFile(hostingPath, "utf8"));

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set(
  "sites-validation",
  `${process.pid}-${Date.now()}`,
);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error(
    "dist/server/index.js must have an ESM default export with fetch(request, env, ctx)",
  );
}

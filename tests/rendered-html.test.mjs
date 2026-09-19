import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

async function collectJavaScript(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaScript(path));
    else if ([".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

test("the built artifact contains the real marketplace and no starter preview marker", async () => {
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  const files = await collectJavaScript(dist);
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.match(source, /Find and buy model cars from stores and collectors in one place/i);
  assert.match(source, /Find model cars from independent sellers in one place/i);
  assert.match(source, /Browse model cars from stores and collectors\./i);
  assert.match(source, /\/marketplace/i);
  assert.match(source, /Verified marketplace record/i);
  assert.match(source, /Completed transactions/i);
  assert.match(source, /On-time shipment/i);
  assert.match(source, /Resolved cases/i);
  assert.doesNotMatch(source, /codex-preview/i);
});

test("the worker applies baseline browser security headers and logs scheduled maintenance", async () => {
  const worker = await readFile(
    new URL("../worker/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /Content-Security-Policy/);
  assert.match(worker, /Strict-Transport-Security/);
  assert.match(worker, /X-Content-Type-Options/);
  assert.match(worker, /Scheduled marketplace maintenance completed/);
});

test("the production catalog correction is conditional and matches the verified listing", async () => {
  const migration = await readFile(
    new URL("../drizzle/0013_production_catalog_correction.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /ut-models-mclaren-f1-lm-orange-124341-ede41d/);
  assert.match(migration, /WHERE `id` = 'ede41d23-6367-4444-96e3-8577d6422fcb'/);
  assert.match(migration, /AND `title` = 'UT Models Mclaren F1 LM - Orange'/);
});

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
  assert.match(source, /Every seller\./i);
  assert.match(source, /Find model cars from independent sellers in one place/i);
  assert.match(source, /Every live listing\. One place\./i);
  assert.match(source, /\/marketplace/i);
  assert.match(source, /Verified marketplace record/i);
  assert.match(source, /Completed transactions/i);
  assert.match(source, /On-time shipment/i);
  assert.match(source, /Resolved cases/i);
  assert.doesNotMatch(source, /codex-preview/i);
});

import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { PhotonImage } from "@cf-wasm/photon";

export function sqliteBinding(sqlite) {
  let pending = Promise.resolve();
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...params) { values = params; return this; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async raw() { const statement = sqlite.prepare(sql); statement.setReturnArrays(true); return statement.all(...values); },
        async all() { return { results: sqlite.prepare(sql).all(...values), success: true }; },
        async run() { return { success: true, meta: sqlite.prepare(sql).run(...values) }; },
      };
    },
    batch(statements) {
      const result = pending.then(async () => {
        sqlite.exec("BEGIN IMMEDIATE");
        try { const values = []; for (const statement of statements) values.push(await statement.all()); sqlite.exec("COMMIT"); return values; }
        catch (error) { sqlite.exec("ROLLBACK"); throw error; }
      });
      pending = result.catch(() => {});
      return result;
    },
  };
}

export async function securityDatabase(t) {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../../drizzle/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) sqlite.exec(await readFile(new URL(name, directory), "utf8"));
  t.after(() => sqlite.close());
  return { sqlite, binding: sqliteBinding(sqlite) };
}

export function jpegWithMetadata() {
  const image = new PhotonImage(new Uint8Array([255, 100, 0, 255]), 1, 1);
  try { const jpeg = image.get_bytes_jpeg(90); return new Uint8Array([...jpeg.slice(0, 2), 255, 225, 0, 5, 71, 80, 83, ...jpeg.slice(2)]); }
  finally { image.free(); }
}

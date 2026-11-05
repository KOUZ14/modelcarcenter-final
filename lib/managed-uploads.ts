import { logSecurityEvent } from "./security-events";
import { consumeRateLimit } from "./security-rate-limit";

const MiB = 1024 * 1024;
const DAY = 86400000;
type Storage = { put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> }): Promise<unknown>; delete(key: string): Promise<unknown> };

export class UploadLimitError extends Error {
  constructor() { super("Upload allowance reached. Remove unused uploads or try again tomorrow."); this.name = "UploadLimitError"; }
}

export async function assertUploadRate(database: D1Database, ownerId: string, secret: string) {
  if (!secret && process.env.NODE_ENV === "production") throw new Error("Upload security is not configured.");
  if (!(await consumeRateLimit(database, { scope: "account-uploads", max: 200, windowSeconds: 3600 }, ownerId, secret || "local-development-security")).allowed) throw new UploadLimitError();
}

export function uploadBudgetStatements(database: D1Database, ownerId: string, key: string, bytes: number, now = Date.now()) {
  if (!ownerId || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 10 * MiB) throw new UploadLimitError();
  const tomorrow = (Math.floor(now / DAY) + 1) * DAY;
  const rules = [
    { id: `owner-daily:${ownerId}`, maxBytes: 256 * MiB, maxFiles: 200, expiresAt: tomorrow },
    { id: "site-daily", maxBytes: 2048 * MiB, maxFiles: 5000, expiresAt: tomorrow },
    { id: `owner-stored:${ownerId}`, maxBytes: 2048 * MiB, maxFiles: 10000, expiresAt: 0 },
    { id: "site-stored", maxBytes: 20 * 1024 * MiB, maxFiles: 100000, expiresAt: 0 },
  ];
  return [
    ...rules.map(rule => database.prepare(`INSERT INTO security_upload_budgets(id,bytes,files,expires_at) VALUES(?,?,1,?)
      ON CONFLICT(id) DO UPDATE SET
        bytes = CASE WHEN expires_at > 0 AND expires_at <= ? THEN excluded.bytes
          WHEN bytes + excluded.bytes <= ? AND files + 1 <= ? THEN bytes + excluded.bytes ELSE NULL END,
        files = CASE WHEN expires_at > 0 AND expires_at <= ? THEN 1 ELSE files + 1 END,
        expires_at = excluded.expires_at`).bind(rule.id, bytes, rule.expiresAt, now, rule.maxBytes, rule.maxFiles, now)),
    database.prepare("INSERT INTO security_uploads(storage_key,owner_id,size_bytes,created_at) VALUES(?,?,?,?)").bind(key, ownerId, bytes, now),
  ];
}

export async function putManagedUpload(input: { database: D1Database; storage: Storage; ownerId: string; key: string; bytes: Uint8Array; mime: string; metadata?: Record<string, string> }) {
  try { await input.database.batch(uploadBudgetStatements(input.database, input.ownerId, input.key, input.bytes.byteLength)); }
  catch (error) {
    if (/NOT NULL constraint failed: security_upload_budgets.bytes/.test(String(error) + String((error as Error)?.cause))) {
      logSecurityEvent("upload_limited", { scope: "uploads", status: 429 });
      throw new UploadLimitError();
    }
    throw error; // Missing quota storage must never permit an unmetered write.
  }
  try {
    await input.storage.put(input.key, input.bytes.slice().buffer as ArrayBuffer, { httpMetadata: { contentType: input.mime }, customMetadata: input.metadata });
  } catch (error) {
    await deleteManagedUpload(input.database, input.storage, input.key).catch(() => undefined);
    throw error;
  }
}

export async function deleteManagedUpload(database: D1Database, storage: Pick<Storage, "delete">, key: string) {
  await database.prepare("INSERT OR IGNORE INTO security_uploads(storage_key,owner_id,size_bytes,created_at) VALUES(?,'legacy-retention-guard',0,?)").bind(key,Date.now()).run();
  const claim=await database.prepare("UPDATE security_uploads SET state='deleting' WHERE storage_key=? AND state!='deleted' RETURNING storage_key").bind(key).first();
  if (!claim) return;
  await storage.delete(key);
  // Tombstones prevent late attachment of an expired URL after object deletion.
  // Subqueries and the state transition make storage-budget refunds idempotent.
  await database.batch([
    database.prepare(`UPDATE security_upload_budgets SET bytes=max(0,bytes-COALESCE((SELECT size_bytes FROM security_uploads WHERE storage_key=?),0)),
      files=max(0,files-1) WHERE id IN ('site-stored', 'owner-stored:' || (SELECT owner_id FROM security_uploads WHERE storage_key=?))
      AND EXISTS(SELECT 1 FROM security_uploads WHERE storage_key=? AND size_bytes>0)`).bind(key, key, key),
    database.prepare("UPDATE security_uploads SET size_bytes=0,state='deleted' WHERE storage_key=?").bind(key),
  ]);
}

export async function pruneManagedUploads(database: D1Database, storage: Pick<Storage, "delete">, now = Date.now()) {
  const result = await database.prepare(`UPDATE security_uploads SET state='deleting' WHERE storage_key IN (
    SELECT u.storage_key FROM security_uploads u WHERE u.created_at < ? AND u.state!='deleted'
      AND NOT EXISTS(SELECT 1 FROM product_images WHERE storage_key=u.storage_key)
      AND NOT EXISTS(SELECT 1 FROM products WHERE primary_image_url='/media/' || u.storage_key)
      AND NOT EXISTS(SELECT 1 FROM resolution_files WHERE storage_key=u.storage_key)
      AND NOT EXISTS(SELECT 1 FROM sellers WHERE logo_url='/media/' || u.storage_key)
      AND NOT EXISTS(SELECT 1 FROM community_media m WHERE (u.storage_key='community/' || m.id || '.jpg' OR u.storage_key='community/' || m.id || '.original.jpg')
        AND (m.item_id IS NOT NULL OR m.post_id IS NOT NULL OR m.thread_id IS NOT NULL
          OR EXISTS(SELECT 1 FROM collector_profiles p WHERE p.avatar_url='/community/media/' || m.id)
          OR EXISTS(SELECT 1 FROM community_settings s WHERE s.cover_id=m.id)))
    ORDER BY u.created_at LIMIT 50) RETURNING storage_key`).bind(now - 7 * DAY).all<{ storage_key: string }>();
  for (const row of result.results ?? []) await deleteManagedUpload(database, storage, row.storage_key);
  return { deleted: result.results?.length ?? 0 };
}

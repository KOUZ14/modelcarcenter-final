import { getD1 } from "@/db";
import { requiredString, ValidationError } from "./validation";

export async function reportListing(userId: string, payload: Record<string, unknown>) {
  const productId = requiredString(payload.productId, "Listing", 100);
  const reason = requiredString(payload.reason, "Reason for report", 1000);
  const db = getD1();
  const listing = await db.prepare(`SELECT p.id FROM products p JOIN sellers s ON s.id=p.seller_id
    WHERE p.id=? AND p.status IN ('active','sold_out') AND s.status='active'`).bind(productId).first();
  if (!listing) throw new ValidationError("This listing is no longer available to report.");
  // Repeated clicks and retries should create only one open report per person.
  await db.prepare(`INSERT INTO community_reports (id,owner_id,target_type,target_id,reason,created_at)
    SELECT ?,?,'listing',?,?,? WHERE NOT EXISTS (
      SELECT 1 FROM community_reports WHERE owner_id=? AND target_type='listing' AND target_id=? AND status='open'
    )`).bind(crypto.randomUUID(), userId, productId, reason, Date.now(), userId, productId).run();
}

export async function resolveListingReport(id: string, action: "remove" | "dismiss", reason: string, adminEmail: string) {
  const db = getD1();
  const report = await db.prepare("SELECT target_id FROM community_reports WHERE id=? AND target_type='listing' AND status='open'").bind(id).first<{ target_id: string }>();
  if (!report) throw new ValidationError("This report has already been resolved or is unavailable.");
  const statements = [];
  if (action === "remove") {
    statements.push(db.prepare(`UPDATE products SET status='inactive',rejection_reason=?,updated_at=?
      WHERE id=? AND EXISTS (SELECT 1 FROM community_reports WHERE id=? AND status='open')`)
      .bind(reason, new Date().toISOString(), report.target_id, id));
  }
  statements.push(db.prepare("UPDATE community_reports SET status='resolved',reviewed_by=?,resolution=? WHERE id=? AND status='open'").bind(adminEmail, reason, id));
  await db.batch(statements);
}
